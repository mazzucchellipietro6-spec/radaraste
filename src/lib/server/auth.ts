// Account con Supabase Auth: sessione nei cookie (lato server), verifica della firma del token,
// livello di sicurezza (aal2 = verifica in due passaggi) per lo staff.
import type { AstroCookies } from 'astro';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import { withUser, type Claims } from './db';

type Ctx = { request: Request; cookies: AstroCookies };

export const authConfigured = () => !!env('PUBLIC_SUPABASE_URL') && !!env('PUBLIC_SUPABASE_ANON_KEY');

export function supabaseFor(ctx: Ctx): SupabaseClient {
  return createServerClient(env('PUBLIC_SUPABASE_URL')!, env('PUBLIC_SUPABASE_ANON_KEY')!, {
    cookies: {
      getAll: () => parseCookieHeader(ctx.request.headers.get('cookie') ?? '').map((c) => ({ name: c.name, value: c.value ?? '' })),
      setAll: (list) => {
        for (const c of list) ctx.cookies.set(c.name, c.value, { ...c.options, path: '/', sameSite: 'lax', secure: import.meta.env.PROD, httpOnly: true });
      },
    },
    auth: { flowType: 'pkce' },
  });
}

/** Client con chiave di servizio: solo lato server, per creare link di accesso e gestire gli utenti. */
let admin: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!authConfigured() || !key) throw new Error('Supabase non configurato (SUPABASE_SERVICE_ROLE_KEY)');
  if (!admin) admin = createClient(env('PUBLIC_SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export interface CurrentUser {
  id: string;
  email: string;
  aal: 'aal1' | 'aal2';
  claims: Claims;
}

/** Utente collegato, con token verificato. null se non ha effettuato l'accesso. */
export async function currentUser(ctx: Ctx): Promise<CurrentUser | null> {
  if (!authConfigured()) return null;
  const sb = supabaseFor(ctx);
  const { data, error } = await sb.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const c = data.claims as unknown as Claims;
  return { id: c.sub, email: String(c.email ?? ''), aal: c.aal === 'aal2' ? 'aal2' : 'aal1', claims: c };
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  company: string | null;
  vat_number: string | null;
  country: string | null;
  city: string | null;
  nationality: string | null;
  lang: string;
  role: 'customer' | 'professional' | 'staff' | 'admin';
  permissions: string[];
  b2b_status: 'none' | 'pending' | 'approved' | 'rejected';
  b2b_type: string | null;
  b2b_website: string | null;
  b2b_notes: string | null;
  marketing_opt_in: boolean;
  created_at: string;
}

export async function loadProfile(user: CurrentUser): Promise<Profile | null> {
  const rows = await withUser(user.claims, (tx) => tx<Profile[]>`select * from public.profiles where id = ${user.id}`);
  return rows[0] ?? null;
}

/** Indirizzi email che diventano amministratori (variabile ADMIN_EMAILS, separati da virgola). */
export const adminEmails = () =>
  (env('ADMIN_EMAILS') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** Cookie leggibile dal browser che dice solo "ha effettuato l'accesso" (nessun dato riservato). */
export function setAuthHint(cookies: AstroCookies, on: boolean) {
  if (on) cookies.set('wc_auth', '1', { path: '/', sameSite: 'lax', secure: import.meta.env.PROD, maxAge: 60 * 60 * 24 * 30 });
  else cookies.delete('wc_auth', { path: '/' });
}
