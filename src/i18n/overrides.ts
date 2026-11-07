// Correzioni delle traduzioni fatte dall'amministratore (pannello Admin > Traduzioni).
// Sono salvate nel database (tabella translation_overrides) e lette:
//  - durante il build, per le pagine statiche (poi "Pubblica le modifiche" avvia un nuovo build);
//  - a ogni richiesta (con cache di 60 secondi) per email, area clienti e pagine dinamiche.
import { dbConfigured, sql } from '~/lib/server/db';

let cache: { at: number; data: Map<string, Record<string, string>> } | null = null;
const TTL = 60_000;

export async function loadOverrides(lang: string): Promise<Record<string, string>> {
  if (!dbConfigured()) return {};
  if (!cache || Date.now() - cache.at > TTL) {
    const data = new Map<string, Record<string, string>>();
    try {
      const rows = await sql()<{ lang: string; key: string; text: string }[]>`
        select lang, key, text from public.translation_overrides where active`;
      for (const r of rows) {
        if (!data.has(r.lang)) data.set(r.lang, {});
        data.get(r.lang)![r.key] = r.text;
      }
    } catch (err) {
      console.warn('[i18n] correzioni delle traduzioni non disponibili:', (err as Error).message);
    }
    cache = { at: Date.now(), data };
  }
  return cache.data.get(lang) ?? {};
}

export function clearOverridesCache() {
  cache = null;
}
