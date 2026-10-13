#!/usr/bin/env node
// Agente "Cacciatore di affari": gira ogni mattina dopo la raccolta e l'arricchimento.
// Legge data/aste.js, analizza le aste nuove o ribassate nelle ultime 24 ore con js/cacciatore.js
// e scrive:
//   data/affari.js                 → sezione "Affari di oggi" della home e selezioni personali
//   data/cacciatore-storico.json   → storico delle aste segnalate con il loro esito (pubblico, nessun dato personale)
//   data/affari-telegram.txt       → testo del messaggio del mattino (lo invia scripts/telegram.mjs se configurato)
// Uso: node scripts/cacciatore.mjs [--dati data/aste.js] [--oggi AAAA-MM-GG]
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = require('../config/tariffe.js');
const Formato = require('../js/formato.js');
const Punteggio = require('../js/punteggio.js');
const Cacciatore = require('../js/cacciatore.js');

function opzione(nome, predefinito) {
  const i = process.argv.indexOf('--' + nome);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : predefinito;
}
// data di oggi in Italia (il giro del mattino parte alle 04:17 UTC = 06:17 ora italiana)
function oggiRoma() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function leggiAste(file) {
  const testo = await readFile(file, 'utf8');
  const i = testo.indexOf('window.ASTE_RACCOLTE = ');
  if (i < 0) throw new Error('formato inatteso di ' + file);
  const dati = JSON.parse(testo.slice(i + 'window.ASTE_RACCOLTE = '.length).replace(/;\s*$/, ''));
  return { dati, aste: Formato.decodifica(dati) };
}

// esiti delle vendite passate dall'indice storico del PVP (se c'è): { 'pvp-<id>': { esito, aggiudicazione } }
async function leggiEsiti(file) {
  if (!existsSync(file)) return {};
  const ind = JSON.parse(await readFile(file, 'utf8'));
  const c = ind.campi || [], iId = c.indexOf('id'), iE = c.indexOf('esito'), iA = c.indexOf('aggiudicazione');
  const CODICI = { deserta: 'ASDES', aggiudicata: 'AGGIU', sospesa: 'SOSPE' };
  const out = {};
  for (const r of ind.righe || []) {
    const e = r[iE];
    if (!e) continue;
    out['pvp-' + String(r[iId]).replace(/^pvp-/, '')] = { esito: CODICI[e] || e, aggiudicazione: iA >= 0 ? r[iA] : null };
  }
  return out;
}

async function main() {
  const fileAste = path.resolve(RADICE, opzione('dati', 'data/aste.js'));
  const cartella = path.dirname(fileAste);
  const oggi = opzione('oggi', oggiRoma());
  const { dati, aste } = await leggiAste(fileAste);
  const zone = Punteggio.indiceZone(aste);
  const t0 = Date.now();
  const r = Cacciatore.esegui({ aste, oggi, T, zone });

  const fileStorico = path.join(cartella, 'cacciatore-storico.json');
  let storico = null;
  if (existsSync(fileStorico)) { try { storico = JSON.parse(await readFile(fileStorico, 'utf8')); } catch { storico = null; } }
  const esiti = await leggiEsiti(path.join(cartella, 'storico-indice.json'));
  storico = Cacciatore.aggiornaStorico(storico, r, esiti, oggi);

  const uscita = { aggiornato: new Date().toISOString(), datiDel: dati.aggiornato, ...r, misure: storico.misure };
  delete uscita.telegram;
  await writeFile(path.join(cartella, 'affari.js'),
    '/* Affari di oggi: generato da scripts/cacciatore.mjs il ' + uscita.aggiornato + ' (regole in js/cacciatore.js, nessuna AI). */\nwindow.AFFARI = ' + JSON.stringify(uscita) + ';\n');
  await writeFile(fileStorico, JSON.stringify(storico, null, 1) + '\n');
  await writeFile(path.join(cartella, 'affari-telegram.txt'), r.telegram + '\n');

  console.log(`✓ Cacciatore: ${r.analizzate} aste analizzate (${Object.entries(r.perMotivo).map(([k, v]) => k + ' ' + v).join(', ')}), ` +
    `${r.migliori.length} affari scelti, ${r.piscina.length} nella piscina personale, in ${Date.now() - t0} ms`);
  for (const [k, v] of Object.entries(r.scartate)) console.log(`  scartate: ${k} → ${v}`);
  r.migliori.forEach((m, i) => console.log(`  ${i + 1}. [${m.punteggio}] ${m.titolo} – ${m.comune || ''} · base ${m.prezzoBase} · sconto ${Math.round(m.sconto * 100)}% · ${m.linkAvviso}`));
  if (r.nota) console.log('  ' + r.nota);
  console.log(`  storico: ${storico.segnalate.length} segnalate, ${storico.misure.conEsito} con esito`);
}

main().catch((e) => { console.error('✗ Cacciatore:', e.message); process.exitCode = 1; });
