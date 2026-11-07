// Controlli per le pagine e le API dell'area clienti.
import type { AstroCookies } from 'astro';
import { authConfigured, currentUser, loadProfile, type CurrentUser, type Profile } from './auth';
import { dbConfigured } from './db';
import { fail } from './http';

type Ctx = { request: Request; cookies: AstroCookies; url: URL };

export type AccountSession = { user: CurrentUser; profile: Profile };

/** Per le pagine: restituisce la sessione oppure l'indirizzo a cui mandare il visitatore. */
export async function accountSession(ctx: Ctx, lang: string): Promise<AccountSession | { redirect: string } | { notConfigured: true }> {
  if (!authConfigured() || !dbConfigured()) return { notConfigured: true };
  const user = await currentUser(ctx);
  if (!user) return { redirect: `/${lang}/account/login/?next=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}` };
  const profile = await loadProfile(user);
  if (!profile) return { redirect: `/${lang}/account/login/` };
  return { user, profile };
}

/** Per le API: utente collegato oppure risposta di errore. */
export async function apiUser(ctx: { request: Request; cookies: AstroCookies }): Promise<CurrentUser | Response> {
  if (!authConfigured() || !dbConfigured()) return fail('not_configured');
  const user = await currentUser(ctx);
  return user ?? fail('unauthorized');
}

/** Ritorno alla pagina di partenza (moduli senza JavaScript) con un messaggio. */
export function back(request: Request, fallback: string, param = 'ok=1') {
  const ref = request.headers.get('referer');
  let to = fallback;
  try {
    if (ref) {
      const u = new URL(ref);
      if (u.origin === new URL(request.url).origin) to = u.pathname;
    }
  } catch {
    /* referer non valido */
  }
  return new Response(null, { status: 303, headers: { location: `${to}${to.includes('?') ? '&' : '?'}${param}` } });
}
