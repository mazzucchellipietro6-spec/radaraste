// Testi da tradurre e traduzioni a mano esistenti: condivisi da i18n-status.mjs e translate.mjs.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectEntry, flatten, SPECS } from '../src/i18n/core.mjs';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const localesDir = join(root, 'src/i18n/locales');
export const autoDir = join(root, 'src/i18n/auto');
export const readJson = (p, fb = {}) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fb);

/** Tutti i testi italiani: { chiave: { text, kind } } con kind 't' (testo) o 'md' (blocco Markdown). */
export function sourceEntries() {
  const out = {};
  for (const [k, v] of Object.entries(flatten(readJson(join(localesDir, 'ui/it.json'))))) out[k] = { text: v, kind: 't' };
  for (const col of Object.keys(SPECS)) {
    const dir = join(root, 'src/content', col);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const id = f.replace(/\.json$/, '');
      for (const m of collectEntry(col, id, readJson(join(dir, f)))) out[m.key] = { text: m.text, kind: m.kind };
    }
  }
  return out;
}

/** Solo i testi: { chiave: testo }. */
export function sourceMessages() {
  return Object.fromEntries(Object.entries(sourceEntries()).map(([k, v]) => [k, v.text]));
}

/** Traduzioni a mano di una lingua (interfaccia + contenuti). */
export function human(lang) {
  return { ...flatten(readJson(join(localesDir, `ui/${lang}.json`))), ...readJson(join(localesDir, `content/${lang}.json`)) };
}
