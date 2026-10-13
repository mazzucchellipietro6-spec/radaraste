#!/usr/bin/env node
// Costruisce l'indice compatto delle quotazioni OMI (data/omi/indice.json) dai file scaricati
// dall'area riservata dell'Agenzia delle Entrate e messi in data/omi/grezzi/:
//   QI_<semestre>.zip   → *_VALORI.csv e *_ZONE.csv (quotazioni di compravendita e locazione, zone)
//   VCN_<anno>.zip      → compravendite per comune (facoltativo)
// Si esegue da solo nel workflow quotidiano se l'indice manca o è più vecchio dei file; a mano: node scripts/omi.mjs
// Dati: Agenzia delle Entrate – OMI, licenza CC BY 4.0 (citare la fonte).
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Omi = require('../js/omi.js');
const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARTELLA = path.join(RADICE, 'data/omi');
const GREZZI = path.join(CARTELLA, 'grezzi');
const USCITA = path.join(CARTELLA, 'indice.json');

// lettore ZIP minimo (metodi "stored" e "deflate"), senza dipendenze
export function leggiZip(buf) {
  let fine = buf.length - 22;
  while (fine >= 0 && buf.readUInt32LE(fine) !== 0x06054b50) fine--;
  if (fine < 0) throw new Error('file ZIP non valido');
  const n = buf.readUInt16LE(fine + 10); let p = buf.readUInt32LE(fine + 16);
  const file = {};
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('directory ZIP non valida');
    const metodo = buf.readUInt16LE(p + 10), dim = buf.readUInt32LE(p + 20);
    const ln = buf.readUInt16LE(p + 28), le = buf.readUInt16LE(p + 30), lc = buf.readUInt16LE(p + 32), loc = buf.readUInt32LE(p + 42);
    const nome = buf.toString('latin1', p + 46, p + 46 + ln);
    const inizio = loc + 30 + buf.readUInt16LE(loc + 26) + buf.readUInt16LE(loc + 28);
    const dati = buf.subarray(inizio, inizio + dim);
    file[nome] = metodo === 0 ? dati : metodo === 8 ? inflateRawSync(dati) : null;
    p += 46 + ln + le + lc;
  }
  return file;
}

async function main() {
  if (!existsSync(GREZZI)) { console.log('Nessuna cartella data/omi/grezzi: quotazioni OMI non disponibili.'); return; }
  const zips = (await readdir(GREZZI)).filter((f) => /\.zip$/i.test(f)).sort();
  const qi = zips.filter((f) => /^QI/i.test(f)).pop(), vcn = zips.filter((f) => /^VCN/i.test(f)).pop();
  if (!qi) { console.log('Nessun file QI*.zip in data/omi/grezzi: quotazioni OMI non disponibili.'); return; }
  if (existsSync(USCITA) && process.argv.indexOf('--forza') < 0) {
    const tIndice = (await stat(USCITA)).mtimeMs;
    const tFile = Math.max(...(await Promise.all([qi, vcn].filter(Boolean).map((f) => stat(path.join(GREZZI, f))))).map((s) => s.mtimeMs));
    const vecchio = JSON.parse(await readFile(USCITA, 'utf8'));
    if (tIndice >= tFile && vecchio.origine && vecchio.origine.qi === qi && vecchio.origine.vcn === (vcn || null)) { console.log('Indice OMI già aggiornato (' + vecchio.semestre + ').'); return; }
  }
  const fq = leggiZip(await readFile(path.join(GREZZI, qi)));
  const nomeZone = Object.keys(fq).find((n) => /_ZONE\.csv$/i.test(n)), nomeValori = Object.keys(fq).find((n) => /_VALORI\.csv$/i.test(n));
  if (!nomeZone || !nomeValori) throw new Error(qi + ': mancano i file *_ZONE.csv o *_VALORI.csv');
  let datiVcn = null;
  if (vcn) {
    const fv = leggiZip(await readFile(path.join(GREZZI, vcn)));
    const trova = (re) => { const n = Object.keys(fv).find((x) => re.test(x)); return n ? fv[n].toString('latin1') : null; };
    datiVcn = { listaCom: trova(/LISTA-COM\.csv$/i), valoriRes: trova(/VALORI-RES\.csv$/i), anno: (vcn.match(/(\d{4})/) || [])[1] || null };
  }
  const ind = Omi.costruisciIndice(fq[nomeZone].toString('latin1'), fq[nomeValori].toString('latin1'), datiVcn);
  ind.origine = { qi, vcn: vcn || null, costruito: new Date().toISOString() };
  await mkdir(CARTELLA, { recursive: true });
  await writeFile(USCITA, JSON.stringify(ind));
  const nZone = Object.values(ind.comuni).reduce((s, c) => s + c.zone.length, 0);
  console.log(`✓ Indice OMI ${ind.semestre}: ${Object.keys(ind.comuni).length} comuni, ${nZone} zone, ${Object.keys(ind.valori).length} zone con valori, ` +
    `${Object.keys(ind.compravendite).length} comuni con compravendite → ${path.relative(RADICE, USCITA)} (${Math.round((await stat(USCITA)).size / 1024)} KB)`);
}

if (import.meta.url === 'file://' + process.argv[1]) main().catch((e) => { console.error('✗ OMI:', e.message); process.exitCode = 1; });
