import type { Page } from '@playwright/test';

/** Consenso cookie già dato e niente proposta di cambio lingua: le pagine si vedono "pulite". */
export async function quiet(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('wc-consent', JSON.stringify({ v: 1, analytics: false, at: new Date().toISOString() }));
      localStorage.setItem('wc-lang', 'chosen');
      sessionStorage.setItem('wc-lang-prompt', '1');
    } catch {}
  });
}

/** Raccoglie gli errori JavaScript della pagina. */
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Vero se la pagina scorre in orizzontale (difetto di impaginazione, soprattutto su telefono). */
export async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

/** I moduli scartano gli invii troppo rapidi (protezione anti-bot): si aspetta come farebbe una persona. */
export const humanPause = (page: Page) => page.waitForTimeout(2100);

import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Variabili del file .env locale (i test girano in un processo separato dal server). */
export function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync('.env')) return undefined;
  const line = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') || undefined;
}

/** Ultimo link di conferma inviato a un indirizzo (le email locali finiscono in EMAIL_OUTBOX_DIR). */
export function lastAuthLink(to: string): string | undefined {
  const dir = localEnv('EMAIL_OUTBOX_DIR');
  if (!dir || !existsSync(dir)) return undefined;
  const tag = to.replace(/[^a-z0-9]+/gi, '_');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f.includes(tag)).sort().reverse();
  for (const f of files) {
    const mail = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const m = String(mail.text ?? '').match(/https?:\/\/\S+auth\/confirm\S+/);
    if (m) return m[0];
  }
  return undefined;
}

/** Codice a 6 cifre di un'app di autenticazione (TOTP, RFC 6238) a partire dal segreto in base32. */
export function totp(secret: string, t = Date.now()) {
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/\s+/g, '').toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const key: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) key.push(parseInt(bits.slice(i, i + 8), 2));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = createHmac('sha1', Buffer.from(key)).update(ctr).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
