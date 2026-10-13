#!/usr/bin/env node
// Raccoglie le aste dalle fonti ufficiali consentite e scrive data/aste.js.
//
//   npm run raccogli                      tutte le fonti attive
//   npm run raccogli -- --solo pvp        una sola fonte
//   npm run raccogli -- --max-pagine 2    prova veloce (solo PVP: 2 pagine da 1000)
//   npm run raccogli -- --max-dettagli 50 quante schede di dettaglio del PVP leggere (predefinito 600, 0 = nessuna)
//   npm run raccogli -- --tempo-max 85    minuti dopo i quali non si leggono più dettagli (per stare nei tempi del workflow)
//   npm run raccogli -- --output percorso/aste.js   scrive altrove (riepilogo.js e dettagli/ nella stessa cartella;
//                                         con un altro nome, es. prova-aste.js: prova-aste-riepilogo.js e prova-aste-dettagli/)
//   npm run raccogli -- --indice percorso/storico-indice.json   indice delle vendite passate (predefinito data/storico-indice.json)
//
// Oltre all'elenco leggero (aste.js) e al riepilogo per la home e la mappa (riepilogo.js) scrive le schede a pezzi
// (dettagli/XX.js, 128 file, vedi js/dettagli.js: record completo + dati lunghi + dettaglio del punteggio) e aggiorna
// l'indice storico delle vendite passate (non pubblicato).
//
// Regole: si leggono solo fonti che lo consentono (robots.txt e termini d'uso verificati);
// se una fonte blocca l'accesso o lo vieta, la raccolta di quella fonte si ferma e lo
// stato viene scritto nel file (pagina "Fonti" del sito). Nessun dato viene inventato:
// se una fonte fallisce si conservano solo le sue aste reali già raccolte in precedenza.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { FonteBloccata, richiestePerHost } from './lib/http.mjs';
import { unisci } from './lib/doppioni.mjs';
import { arricchisci, valutaTutte, scriviSchede, record } from './lib/arricchimento.mjs';
import { adessoRoma, giaIniziata, anomalia, fileCollegati } from './lib/correzioni.mjs';
import { statoAgenti, scriviCombinazioni } from './lib/derivati.mjs';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// Registro delle fonti con l'esito della verifica di robots.txt e termini d'uso (condiviso con il sito).
const REGISTRO = require('../config/fonti.js');
const Formato = require('../js/formato.js');
const Riepilogo = require('../js/riepilogo.js');
const T = require('../config/tariffe.js');
// Modulo di raccolta di ogni fonte (scripts/fonti/<chiave>.mjs), caricato solo se la fonte è attiva.
// L'ordine del registro è anche la priorità contro i doppioni: prima il PVP.
async function modulo(chiave) {
  try { return await import(`./fonti/${chiave}.mjs`); } catch (e) { console.error(`  ✗ modulo ${chiave} non disponibile: ${e.message}`); return null; }
}

export function argomenti(a = process.argv.slice(2)) {
  const o = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--solo') o.solo = a[++i];
    else if (a[i] === '--max-pagine') o.maxPagine = parseInt(a[++i], 10);
    else if (a[i] === '--output') o.output = a[++i];
    else if (a[i] === '--max-dettagli') o.maxDettagli = parseInt(a[++i], 10);
    else if (a[i] === '--indice') o.indice = a[++i];
    else if (a[i] === '--tempo-max') o.tempoMax = parseFloat(a[++i]);
  }
  return o;
}

// Formato compatto: elenco dei campi + una riga (array) per asta, per tenere leggero il file.
// I campi dopo "vista" sono quelli dell'arricchimento e del punteggio, in ordine di frequenza (i valori vuoti in fondo
// alla riga non si scrivono):
//   numeroLotto, rialzo (rilancio minimo), rischi (chiavi di js/estrai.js; [] = testo controllato, nessun rischio),
//   tentativo (1 = prima asta trovata nell'indice), superficieMq; valore, valoreMin, valoreMax, fonteValore ('perizia',
//   'primo-prezzo', 'prima-asta'), affidabilita, costoTotale, sconto, offertaMax, punteggio, punteggioCompleto
//   (js/punteggio.js); deserte, primoPrezzo, ribasso (1 − prezzo / prezzo del tentativo precedente) solo se ci sono
//   tentativi precedenti; dettaglio (data di lettura della scheda /restricted), termineOfferte ('AAAA-MM-GGTHH:MM'),
//   stima, nFoto, annoProcedura (dal dettaglio); prezzoPrecedente e dataRibasso (prezzo base sceso rispetto alla
//   raccolta precedente); anomalia ('offerta-minima-sopra-base'). I dati lunghi sono in dettagli/XX.js.
export const CAMPI = ['id', 'titolo', 'categoria', 'tipo', 'regione', 'provincia', 'comune', 'indirizzo', 'tribunale', 'rge', 'fonte',
  'prezzoBase', 'offertaMinima', 'dataAsta', 'ora', 'stato', 'linkAvviso', 'linkPerizia', 'linkPdf', 'lat', 'lng', 'descrizione', 'altriLink', 'pubblicata', 'vista',
  'numeroLotto', 'rialzo', 'rischi', 'tentativo', 'superficieMq',
  'valore', 'valoreMin', 'valoreMax', 'fonteValore', 'affidabilita', 'costoTotale', 'sconto', 'offertaMax', 'punteggio', 'punteggioCompleto',
  'deserte', 'primoPrezzo', 'ribasso', 'dettaglio', 'termineOfferte', 'stima', 'nFoto', 'annoProcedura',
  'prezzoPrecedente', 'dataRibasso', 'anomalia',
  'omiMin', 'omiMax', 'omiAffMin', 'omiAffMax', 'omiMetodo', 'omiZona', 'rendimento'];

async function precedente(file) {
  try {
    const t = await readFile(file, 'utf8');
    const j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    return { aste: Formato.decodifica(j), fonti: j.fonti || [] };
  } catch { return { aste: [], fonti: [] }; }
}

async function scriviAtomico(file, testo) {
  await writeFile(file + '.tmp', testo);
  await rename(file + '.tmp', file);
}

const conta = (lista, f) => { const o = {}; for (const a of lista) { const k = f(a); if (k != null) o[k] = (o[k] || 0) + 1; } return o; };

async function main() {
  const opz = argomenti();
  const file = path.resolve(RADICE, opz.output || 'data/aste.js');
  const collegati = fileCollegati(file);
  const adesso = adessoRoma();
  const oggi = adesso.data; // data di Roma
  const prima = await precedente(file);
  const perFonte = [], statoFonti = [];
  const avvio = Date.now();
  let richiesteTotali = 0, futureViste = 0;
  const correzioni = {};

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
      const r = await m.raccogli({ oggi, maxPagine: opz.maxPagine });
      if (r.richieste) richiesteTotali += r.richieste;
      if (f.chiave === 'pvp') { futureViste = r.futureViste || 0; if (r.correzioni) Object.assign(correzioni, r.correzioni); }
      risultato.push(...r.aste);
      statoFonti.push({ ...base, stato: 'attiva', metodo: f.metodo, motivo: `${f.motivo} Ultima raccolta: ${r.nota}`, aste: r.aste.length, ultimaRaccolta: new Date().toISOString(), durataSec: Math.round((Date.now() - inizio) / 1000) });
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
  const { aste: tutte, doppioni } = unisci(pulite);
  // aste di oggi con l'orario già raggiunto (ora di Roma): già iniziate o concluse, non si mostrano
  const uniche = tutte.filter((a) => !giaIniziata(a, adesso));
  correzioni.giaIniziate = tutte.length - uniche.length;
  // "vista": giorno in cui la raccolta ha trovato l'asta per la prima volta (serve per "nuove dall'ultima visita")
  const giaViste = new Map(prima.aste.map((a) => [a.id, a.vista]));
  for (const a of uniche) {
    a.vista = giaViste.get(a.id) || oggi;
    // offerta minima più alta del prezzo base: dato della fonte, si tiene ma si segnala
    const an = anomalia(a);
    if (an) a.anomalia = an; else delete a.anomalia;
  }
  correzioni.offertaSopraBase = uniche.filter((a) => a.anomalia === 'offerta-minima-sopra-base').length;
  if (doppioni) console.log(`  ${doppioni} aste già presenti su una fonte con priorità più alta: tenuto solo il link`);
  console.log(`  ${correzioni.giaIniziate} aste di oggi già iniziate (ora di Roma ${adesso.ora}) escluse; ${correzioni.offertaSopraBase} con offerta minima sopra il prezzo base (segnalate)`);
  uniche.sort((a, b) => (a.dataAsta || '').localeCompare(b.dataAsta || '') || (a.ora || '').localeCompare(b.ora || ''));

  // arricchimento delle aste del PVP: descrizione, storico dei tentativi, dettagli, ribassi
  let arricchimento = null, schede = null;
  try {
    console.log('→ Arricchimento delle aste del PVP');
    const r = await arricchisci({
      aste: uniche, prima: prima.aste, oggi, cartella: collegati.dettagli,
      fileIndice: path.resolve(RADICE, opz.indice || 'data/storico-indice.json'),
      maxDettagli: Number.isFinite(opz.maxDettagli) ? opz.maxDettagli : 600,
      scadenzaDettagli: Number.isFinite(opz.tempoMax) ? avvio + opz.tempoMax * 60000 : Infinity,
      primaPaginaIndice: Math.max(0, Math.floor(futureViste / 1000) - 1)
    });
    const s = r.stat;
    schede = r.schede;
    richiesteTotali += s.richiesteStorico + s.richiesteDettagli;
    arricchimento = {
      conDettaglio: uniche.filter((a) => a.dettaglio).length, dettagliLettiOggi: s.dettagliNuovi, richiesteDettagli: s.richiesteDettagli,
      conStorico: uniche.filter((a) => a.tentativo).length, catene: s.catene, ambigue: s.ambigue, indice: s.indice || null,
      ...(s.dettagliRifiutati ? { dettagliRifiutati: s.dettagliRifiutati } : {}),
      ...(s.dettagliFermo ? { dettagliFermo: s.dettagliFermo } : {})
    };
    console.log(`  ✓ ${s.dettagliNuovi} dettagli letti ora (${s.richiesteDettagli} richieste${s.dettagliRifiutati ? `, ${s.dettagliRifiutati} vendite rifiutate dal sito e saltate` : ''}), ${s.dettagliConservati} conservati dalle raccolte precedenti, ` +
      `${s.catene} aste con tentativi precedenti, ${s.ambigue} catene ambigue non collegate (${s.durataSec} s)` + (s.dettagliFermo ? ` – dettagli interrotti: ${s.dettagliFermo}` : ''));
  } catch (e) {
    console.error(`  ✗ arricchimento non riuscito: ${e.stack || e.message}`);
  } finally {
    for (const a of uniche) delete a._pvp;
  }

  // punteggio affare su tutte le aste (dopo arricchimento e storico)
  // quotazioni OMI (Agenzia delle Entrate – OMI): indice costruito da scripts/omi.mjs con i file dell'area riservata, non pubblicati
  let indiceOmi = null;
  try { indiceOmi = JSON.parse(await readFile(path.resolve(RADICE, opz.omi || 'data/omi/indice.json'), 'utf8')); } catch { indiceOmi = null; }
  console.log(indiceOmi ? `  quotazioni OMI ${indiceOmi.semestre} caricate` : '  quotazioni OMI non disponibili (manca data/omi/indice.json): valore dalla perizia o dalla prima asta');
  const { dettagli: punteggi } = valutaTutte(uniche, T, { omi: indiceOmi, testi: (a) => (schede && schede.get(a.id) && schede.get(a.id).descrizione) || a.descrizione || a.titolo });
  const conOmi = uniche.filter((a) => a.omiMin).length;
  if (indiceOmi) console.log(`  OMI: ${conOmi} immobili con valore OMI (${uniche.filter((a) => a.omiMetodo === 'indirizzo' || a.omiMetodo === 'unica').length} con la zona riconosciuta)`);
  const punteggio = {
    conValore: uniche.filter((a) => a.valore != null).length,
    perFonte: conta(uniche, (a) => a.fonteValore), perAffidabilita: conta(uniche, (a) => a.affidabilita),
    conPunteggio: uniche.filter((a) => a.punteggio != null).length, completi: uniche.filter((a) => a.punteggioCompleto).length,
    omi: indiceOmi ? { semestre: indiceOmi.semestre, conValore: conOmi, fonte: indiceOmi.fonte, licenza: indiceOmi.licenza } : null
  };
  console.log(`  punteggio: ${punteggio.conValore} aste con valore, ${punteggio.conPunteggio} con punteggio, ${punteggio.completi} con punteggio completo`);

  // schede a pezzi: record completo di ogni asta (se l'arricchimento è fallito si lasciano i pezzi precedenti)
  let pezzi = null;
  if (schede) {
    const records = new Map(uniche.map((a) => [a.id, record(a, CAMPI, schede.get(a.id), punteggi.get(a.id))]));
    pezzi = await scriviSchede(collegati.dettagli, records);
    console.log(`  ✓ ${records.size} schede in ${pezzi.file} pezzi (${Math.round(pezzi.byte / 1024)} KB, il più grande ${Math.round(pezzi.max / 1024)} KB)` + (pezzi.tolti ? `, ${pezzi.tolti} pezzi vecchi tolti` : ''));
  }

  const dati = { aggiornato: new Date().toISOString(), fonti: statoFonti, arricchimento, correzioni, punteggio, ...Formato.codifica(uniche, CAMPI) };
  const intestazione = '/* ASTE RACCOLTE DALLE FONTI UFFICIALI – file generato da scripts/raccogli.mjs il ' + dati.aggiornato + '.\n * Non modificarlo a mano: viene riscritto a ogni raccolta. Ogni asta ha il link all\'avviso originale (linkAvviso). */\n';
  await scriviAtomico(file, intestazione + 'window.ASTE_RACCOLTE = ' + JSON.stringify(dati) + ';\n');
  // riepilogo leggero per la home e la mappa (stessa cartella del file delle aste)
  const riepilogo = { aggiornato: dati.aggiornato, fonti: statoFonti.map((f) => ({ nome: f.nome, stato: f.stato })), ...Riepilogo.calcola(uniche, oggi), agenti: statoAgenti(uniche, dati) };
  await scriviAtomico(collegati.riepilogo, '/* Riepilogo per la home, generato da scripts/raccogli.mjs il ' + dati.aggiornato + '. */\nwindow.RIEPILOGO = ' + JSON.stringify(riepilogo) + ';\n');
  // Combinazioni d'oro (lotti della stessa procedura che insieme valgono di più)
  try {
    const c = await scriviCombinazioni(path.join(path.dirname(file), 'combinazioni.js'), uniche, T, oggi);
    console.log(`  combinazioni d'oro: ${c.trovate} su ${c.gruppiAnalizzati} procedure con più lotti`);
  } catch (e) { console.error(`  ✗ combinazioni non calcolate: ${e.message}`); }
  const perHost = [...richiestePerHost].map(([h, n]) => `${h} ${n}`).join(', ');
  console.log(`✓ ${uniche.length} aste scritte in ${path.relative(RADICE, file) || file} (${statoFonti.filter((s) => s.stato === 'attiva').length} fonti attive; ` +
    `${richiesteTotali} richieste al PVP tra ricerca, storico e dettagli; richieste per sito: ${perHost || 'nessuna'}; ${Math.round((Date.now() - avvio) / 1000)} s)`);
  if (!statoFonti.some((s) => s.stato === 'attiva')) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
