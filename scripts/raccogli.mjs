#!/usr/bin/env node
// Raccoglie le aste dalle fonti ufficiali consentite e scrive data/aste.js.
//
//   npm run raccogli                      tutte le fonti attive
//   npm run raccogli -- --solo pvp        una sola fonte
//   npm run raccogli -- --max-pagine 2    prova veloce (solo PVP: 2 pagine da 100)
//
// Regole: si leggono solo fonti che lo consentono (robots.txt e termini d'uso verificati);
// se una fonte blocca l'accesso o lo vieta, la raccolta di quella fonte si ferma e lo
// stato viene scritto nel file (pagina "Fonti" del sito). Nessun dato viene inventato:
// se una fonte fallisce si conservano solo le sue aste reali già raccolte in precedenza.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { FonteBloccata } from './lib/http.mjs';
import { unisci } from './lib/doppioni.mjs';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// Registro delle fonti con l'esito della verifica di robots.txt e termini d'uso (condiviso con il sito).
const REGISTRO = require('../config/fonti.js');
const Formato = require('../js/formato.js');
// Modulo di raccolta di ogni fonte (scripts/fonti/<chiave>.mjs), caricato solo se la fonte è attiva.
// L'ordine del registro è anche la priorità contro i doppioni: prima il PVP.
async function modulo(chiave) {
  try { return await import(`./fonti/${chiave}.mjs`); } catch (e) { console.error(`  ✗ modulo ${chiave} non disponibile: ${e.message}`); return null; }
}

function argomenti() {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--solo') o.solo = a[++i];
    else if (a[i] === '--max-pagine') o.maxPagine = parseInt(a[++i], 10);
    else if (a[i] === '--output') o.output = a[++i];
  }
  return o;
}

// Formato compatto: elenco dei campi + una riga (array) per asta, per tenere leggero il file.
const CAMPI = ['id', 'titolo', 'categoria', 'tipo', 'regione', 'provincia', 'comune', 'indirizzo', 'tribunale', 'rge', 'fonte',
  'prezzoBase', 'offertaMinima', 'dataAsta', 'ora', 'stato', 'linkAvviso', 'linkPerizia', 'linkPdf', 'lat', 'lng', 'descrizione', 'altriLink', 'pubblicata', 'vista'];

async function precedente(file) {
  try {
    const t = await readFile(file, 'utf8');
    const j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    return { aste: Formato.decodifica(j), fonti: j.fonti || [] };
  } catch { return { aste: [], fonti: [] }; }
}

async function main() {
  const opz = argomenti();
  const file = path.resolve(RADICE, opz.output || 'data/aste.js');
  const oggi = new Date().toISOString().slice(0, 10);
  const prima = await precedente(file);
  const perFonte = [], statoFonti = [];

  for (const f of REGISTRO) {
    const base = { nome: f.nome, url: f.url, controllo: oggi };
    const m = f.stato === 'attiva' ? await modulo(f.chiave) : null;
    if (!m) { statoFonti.push({ ...base, stato: f.stato === 'attiva' ? 'errore' : f.stato, motivo: f.motivo, controllo: f.verificato }); continue; }
    const risultato = []; perFonte.push(risultato);
    const vecchie = prima.aste.filter((a) => a.fonte === f.nome && a.dataAsta >= oggi);
    const vecchioStato = prima.fonti.find((x) => x.nome === f.nome);
    if (opz.solo && opz.solo !== f.chiave) {
      risultato.push(...vecchie);
      statoFonti.push(vecchioStato || { ...base, stato: 'non-verificata', motivo: 'Non ancora raccolta.' });
      continue;
    }
    console.log(`→ ${f.nome}`);
    const inizio = Date.now();
    try {
      const { aste, nota } = await m.raccogli({ oggi, maxPagine: opz.maxPagine });
      risultato.push(...aste);
      statoFonti.push({ ...base, stato: 'attiva', metodo: f.metodo, motivo: `${f.motivo} Ultima raccolta: ${nota}`, aste: aste.length, ultimaRaccolta: new Date().toISOString(), durataSec: Math.round((Date.now() - inizio) / 1000) });
    } catch (e) {
      const stato = e instanceof FonteBloccata ? e.stato : 'errore';
      console.error(`  ✗ ${f.nome}: ${e.message}`);
      risultato.push(...vecchie);
      statoFonti.push({
        ...base, stato, metodo: f.metodo, aste: vecchie.length, ultimaRaccolta: vecchioStato?.ultimaRaccolta || null,
        motivo: `Raccolta interrotta il ${oggi}: ${e.message}.` + (vecchie.length ? ` Restano visibili ${vecchie.length} aste raccolte il ${(vecchioStato?.ultimaRaccolta || '').slice(0, 10)}.` : ' Nessuna asta disponibile da questa fonte.')
      });
    }
  }

  // stesso id una sola volta, solo aste con titolo e link all'avviso, poi niente doppioni tra fonti
  const visti = new Set();
  const pulite = perFonte.map((lista) => lista.filter((a) => {
    if (visti.has(a.id) || !a.titolo || !/^https?:\/\//.test(a.linkAvviso || '')) return false;
    visti.add(a.id); delete a.altriLink; return true;
  }));
  const { aste: uniche, doppioni } = unisci(pulite);
  // "vista": giorno in cui la raccolta ha trovato l'asta per la prima volta (serve per "nuove dall'ultima visita")
  const giaViste = new Map(prima.aste.map((a) => [a.id, a.vista]));
  for (const a of uniche) a.vista = giaViste.get(a.id) || oggi;
  if (doppioni) console.log(`  ${doppioni} aste già presenti su una fonte con priorità più alta: tenuto solo il link`);
  uniche.sort((a, b) => (a.dataAsta || '').localeCompare(b.dataAsta || ''));
  const dati = { aggiornato: new Date().toISOString(), fonti: statoFonti, ...Formato.codifica(uniche, CAMPI) };
  const intestazione = '/* ASTE RACCOLTE DALLE FONTI UFFICIALI – file generato da scripts/raccogli.mjs il ' + dati.aggiornato + '.\n * Non modificarlo a mano: viene riscritto a ogni raccolta. Ogni asta ha il link all\'avviso originale (linkAvviso). */\n';
  await writeFile(file, intestazione + 'window.ASTE_RACCOLTE = ' + JSON.stringify(dati) + ';\n');
  console.log(`✓ ${uniche.length} aste scritte in ${path.relative(RADICE, file)} (${statoFonti.filter((s) => s.stato === 'attiva').length} fonti attive)`);
  if (!statoFonti.some((s) => s.stato === 'attiva')) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
