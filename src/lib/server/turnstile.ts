// Verifica antispam Cloudflare Turnstile (lato server). Senza chiave segreta configurata
// la verifica viene saltata e restano attivi campo trappola, controllo dei tempi e limiti di frequenza.
import { env, isProd } from './env';

let warned = false;

export async function verifyTurnstile(token: unknown, ip?: string): Promise<boolean> {
  const secret = env('TURNSTILE_SECRET_KEY');
  if (!secret) {
    if (isProd() && !warned) {
      console.warn('[sicurezza] TURNSTILE_SECRET_KEY non impostata: i moduli sono protetti solo da campo trappola e limiti di frequenza.');
      warned = true;
    }
    return true;
  }
  if (typeof token !== 'string' || !token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== 'unknown') body.set('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = (await res.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}

/** Campo trappola compilato o invio troppo rapido (meno di 2 secondi dal caricamento): quasi certamente un robot. */
export function looksLikeBot(body: Record<string, unknown>) {
  if (typeof body.website === 'string' && body.website.trim() !== '') return true;
  const ts = Number(body._ts);
  if (Number.isFinite(ts) && ts > 0 && Date.now() - ts < 2000) return true;
  return false;
}
