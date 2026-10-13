#!/usr/bin/env node
// Prepara la cartella _artifact/ per pubblicare il sito come Artifact su claude.ai:
// la pagina principale (index.html) senza doctype/html/head/body, perché l'ospite la avvolge da sé;
// le altre pagine e i file statici così come sono.
import { cp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(RADICE, '_artifact');

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
// non si pubblicano: l'indice storico (cache della raccolta), la cartella OMI (file originali e indice completo:
// condizioni d'uso dell'Agenzia delle Entrate) e il testo del messaggio Telegram
const daEscludere = (f) => /storico-indice\.json|\.tmp$|[\\/]data[\\/]omi([\\/]|$)|affari-telegram\.txt$/.test(f);
for (const dir of ['assets', 'config', 'data', 'js']) await cp(path.join(RADICE, dir), path.join(OUT, dir), { recursive: true, filter: (f) => !daEscludere(f) });
await cp(path.join(RADICE, 'manifest.webmanifest'), path.join(OUT, 'manifest.webmanifest'));
// versione della cache del service worker: data e ora di generazione (AAAAMMGG-HHMM, UTC), così ogni pubblicazione aggiorna i file
const versione = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
await writeFile(path.join(OUT, 'sw.js'), (await readFile(path.join(RADICE, 'sw.js'), 'utf8')).replace(/__VERSIONE__/g, versione));

const pagine = (await readdir(RADICE)).filter((f) => f.endsWith('.html'));
for (const p of pagine) {
  let html = await readFile(path.join(RADICE, p), 'utf8');
  if (p === 'index.html') {
    html = html
      .replace(/<!doctype html>\s*/i, '')
      .replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*/i, '')
      .replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '')
      .replace(/<body>\s*/i, '').replace(/<\/body>\s*/i, '')
      .replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
  }
  await writeFile(path.join(OUT, p), html);
}
console.log('Pronto in _artifact/:', pagine.join(', '), '· versione della cache', versione);
