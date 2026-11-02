#!/usr/bin/env node
// Stato delle traduzioni a mano.
//   node scripts/i18n-status.mjs                 -> riepilogo per lingua (mancanti / da aggiornare)
//   node scripts/i18n-status.mjs --missing de    -> elenco dei testi italiani ancora da tradurre in tedesco (JSON)
//   node scripts/i18n-status.mjs --lock de fr    -> segna come aggiornate le traduzioni a mano di queste lingue
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { hash } from '../src/i18n/core.mjs';
import { MAIN_CODES } from '../src/i18n/languages.mjs';
import { human, localesDir as loc, readJson, sourceMessages } from './i18n-source.mjs';

export { sourceMessages };

const args = process.argv.slice(2);
const src = sourceMessages();

if (args[0] === '--missing') {
  const lang = args[1];
  const h = human(lang);
  const lock = readJson(join(loc, `lock/${lang}.json`));
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    const plural = /\.(one|other)$/.test(k) && h[k.replace(/\.(one|other)$/, '.other')] != null;
    if ((h[k] == null && !plural) || (lock[k] && lock[k] !== hash(v))) out[k] = v;
  }
  const filter = args[2];
  const filtered = filter ? Object.fromEntries(Object.entries(out).filter(([k]) => k.startsWith(filter))) : out;
  console.log(JSON.stringify(filtered, null, 1));
} else if (args[0] === '--lock') {
  mkdirSync(join(loc, 'lock'), { recursive: true });
  for (const lang of args.slice(1)) {
    const h = human(lang);
    const lock = {};
    for (const [k, v] of Object.entries(src)) if (h[k] != null) lock[k] = hash(v);
    writeFileSync(join(loc, `lock/${lang}.json`), JSON.stringify(lock, null, 0) + '\n');
    console.log(`${lang}: ${Object.keys(lock).length} testi segnati come aggiornati`);
  }
} else {
  const total = Object.keys(src).length;
  console.log(`Testi italiani: ${total}`);
  for (const lang of MAIN_CODES.filter((l) => l !== 'it')) {
    const h = human(lang);
    const lock = readJson(join(loc, `lock/${lang}.json`));
    let missing = 0;
    let stale = 0;
    for (const [k, v] of Object.entries(src)) {
      if (h[k] == null) missing++;
      else if (lock[k] && lock[k] !== hash(v)) stale++;
    }
    console.log(`${lang.padEnd(3)} mancanti ${String(missing).padStart(5)}   da aggiornare ${String(stale).padStart(5)}`);
  }
}
