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
for (const dir of ['assets', 'config', 'data', 'js']) await cp(path.join(RADICE, dir), path.join(OUT, dir), { recursive: true });

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
console.log('Pronto in _artifact/:', pagine.join(', '));
