// Arricchimento delle aste del PVP, dopo la raccolta:
//   - descrizione completa (descLotto della ricerca, gratis) → scheda a pezzi, superficie e rischi;
//   - storico dei tentativi (indice delle vendite passate) → tentativo, deserte, primo prezzo, ribasso;
//   - dettaglio pubblico /restricted (al massimo N per raccolta) → foto, allegati, catasto, cauzione, termine offerte...;
//   - ribassi da un giorno all'altro (stesso id, prezzo base sceso);
//   - punteggio affare (js/punteggio.js) su tutte le aste, dopo arricchimento e storico.
// Le schede (record completo + dati lunghi) vanno in <cartella>/XX.js, 128 pezzi (js/dettagli.js);
// nell'elenco leggero restano solo i campi corti.
import { readFile, writeFile, mkdir, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { aggiornaIndice, leggiIndice, riga, daRiga, raggruppa, catena } from './storico.mjs';
import { estrai, descrizione, scarica, ordina } from './dettaglio-pvp.mjs';
import { prezzo } from './correzioni.mjs';

const require = createRequire(import.meta.url);
const Dettagli = require('../../js/dettagli.js');
const Estrai = require('../../js/estrai.js');
const Punteggio = require('../../js/punteggio.js');

// rischi che hanno senso per ogni categoria
const RISCHI_PER = {
  immobile: ['abusi', 'quota', 'superficie', 'condominio', 'vincoli', 'degrado', 'occupazione', 'agricolo'],
  auto: ['chiavi', 'documenti', 'marcia', 'quota'],
  moto: ['chiavi', 'documenti', 'marcia', 'quota'],
  beni: ['quota']
};

// campi della scheda che vengono dal dettaglio /restricted (si conservano da una raccolta all'altra)
export const DAL_DETTAGLIO = ['descrizione', 'foto', 'fotoTotali', 'allegati', 'catasto', 'vani', 'piano', 'cauzione', 'cauzionePerc',
  'contoSpese', 'contoSpesePerc', 'modalita', 'tipoVendita', 'rialzo', 'stima', 'termineOfferte', 'rge', 'annoProcedura', 'rito', 'esito'];
// dati lunghi della scheda (oltre ai campi corti dell'elenco); i campi del punteggio si ricalcolano ogni volta
export const LUNGHI = ['descrizione', 'foto', 'fotoTotali', 'allegati', 'catasto', 'vani', 'piano', 'cauzione', 'cauzionePerc', 'contoSpese',
  'contoSpesePerc', 'modalita', 'tipoVendita', 'rito', 'esito', 'rge', 'rischi', 'superficieDa', 'superficieProva', 'storico', 'storicoNota'];
export const DAL_PUNTEGGIO = ['valoreEtichetta', 'parti', 'mancanti', 'controlli', 'zona'];
// campi corti del punteggio (Punteggio.compatto)
export const CAMPI_PUNTEGGIO = ['valore', 'valoreMin', 'valoreMax', 'fonteValore', 'affidabilita', 'costoTotale', 'sconto', 'offertaMax', 'punteggio', 'punteggioCompleto'];
// campi corti calcolati dall'arricchimento (si azzerano e si ricalcolano per le aste raccolte ora)
const CORTI = ['tentativo', 'rischi', 'superficieMq', 'deserte', 'primoPrezzo', 'ribasso', 'annoProcedura', 'dettaglio', 'termineOfferte', 'stima', 'nFoto',
  'prezzoPrecedente', 'dataRibasso'];

const PEZZO = /^([0-9a-f]{2})\.js$/;

export async function leggiSchede(cartella) {
  const out = new Map();
  let file = [];
  try { file = await readdir(cartella); } catch { return out; }
  for (const f of file) {
    if (!PEZZO.test(f)) continue;
    try {
      const p = Dettagli.analizza(await readFile(path.join(cartella, f), 'utf8'));
      if (p) for (const [id, s] of Object.entries(p)) out.set(id, s);
    } catch { /* pezzo illeggibile: si rifà */ }
  }
  return out;
}

// Scrive tutti i 128 pezzi (anche vuoti, così il sito non trova mai un file mancante) e toglie quelli di schemi
// precedenti (es. 80..ff della divisione in 256). records: Map id → oggetto completo.
export async function scriviSchede(cartella, records) {
  await mkdir(cartella, { recursive: true });
  const chiavi = Dettagli.chiavi();
  const pezzi = Object.fromEntries(chiavi.map((k) => [k, {}]));
  for (const [id, s] of records) pezzi[Dettagli.chiave(id)][id] = s;
  let byte = 0, max = 0;
  for (const k of chiavi) {
    const t = Dettagli.testo(k, pezzi[k]);
    const n = Buffer.byteLength(t);
    byte += n; if (n > max) max = n;
    const f = path.join(cartella, k + '.js');
    await writeFile(f + '.tmp', t);
    await rename(f + '.tmp', f);
  }
  const validi = new Set(chiavi.map((k) => k + '.js'));
  let tolti = 0;
  for (const f of await readdir(cartella)) {
    if ((PEZZO.test(f) && !validi.has(f)) || /^[0-9a-f]{2}\.js\.tmp$/.test(f)) { await rm(path.join(cartella, f), { force: true }); tolti++; }
  }
  return { byte, max, file: chiavi.length, tolti };
}

const pulito = (o) => { for (const k of Object.keys(o)) if (o[k] === null || o[k] === undefined || o[k] === '' || (Array.isArray(o[k]) && !o[k].length && k !== 'rischi')) delete o[k]; return o; };

// dati del dettaglio già letti in una raccolta precedente (dal record del pezzo)
export function daVecchia(v) {
  const letto = v && (v.dettaglio || v.letto);
  if (!letto) return null;
  const d = { dettaglio: letto };
  for (const k of DAL_DETTAGLIO) if (v[k] !== undefined && v[k] !== null) d[k] = v[k];
  if (v.mq) d.mqScheda = v.mq;
  else if (v.superficieDa === 'scheda' && v.superficieMq) d.mqScheda = v.superficieMq;
  if (d.fotoTotali == null && Array.isArray(v.foto)) d.fotoTotali = v.foto.length;
  return d;
}

// Calcola scheda (dati lunghi) e campi corti di un'asta del PVP (funzione pura: tests/dettaglio.test.mjs).
//   a: asta convertita (con a._pvp); vecchiaScheda: record salvato in precedenza nel pezzo; nuovoDettaglio: corpo /restricted
//   letto ora; prima: la stessa asta nel file precedente (campi corti); storia: risultato di catena() o null.
export function componi(a, { vecchiaScheda = null, nuovoDettaglio = null, prima = null, storia = null, oggi }) {
  const x = a._pvp || {};
  const det = nuovoDettaglio ? estrai(nuovoDettaglio, { oggi, descLotto: x.descLotto }) : daVecchia(vecchiaScheda);
  const scheda = {};
  if (det) for (const k of DAL_DETTAGLIO) if (det[k] !== undefined) scheda[k] = det[k];
  if (!scheda.descrizione) scheda.descrizione = descrizione(x.descLotto) || undefined;
  const testo = scheda.descrizione || '';
  const corti = {};
  // rischi: solo se c'è un testo da controllare (elenco vuoto = controllato, nessun rischio trovato)
  if (testo) {
    const ammessi = RISCHI_PER[a.categoria] || RISCHI_PER.beni;
    const rischi = Estrai.rischi(testo).filter((r) => ammessi.includes(r.chiave));
    scheda.rischi = rischi;
    corti.rischi = rischi.map((r) => r.chiave);
  }
  if (a.categoria === 'immobile') {
    if (det && det.mqScheda) { corti.superficieMq = det.mqScheda; scheda.superficieDa = 'scheda'; }
    else {
      const s = Estrai.superficie(testo);
      if (s && s.mq) { corti.superficieMq = s.mq; scheda.superficieDa = 'testo'; scheda.superficieProva = s.prova; }
      if (s && s.vani && !scheda.vani) scheda.vani = s.vani;
    }
  }
  if (storia && !storia.ambigua) {
    corti.tentativo = storia.tentativo;
    if (storia.tentativo > 1 || storia.storico.length) {
      corti.deserte = storia.deserte;
      if (storia.primoPrezzo != null) corti.primoPrezzo = storia.primoPrezzo;
      if (storia.ribasso != null) corti.ribasso = storia.ribasso;
      scheda.storico = storia.storico.map((s) => [s[0], s[1] ?? null, s[2] ?? null]);
    }
    if (storia.parziale) scheda.storicoNota = 'Tentativi più vecchi non collegati: ' + storia.parziale + '.';
  } else if (storia && storia.ambigua) {
    scheda.storicoNota = 'Tentativi precedenti non collegati: ' + storia.motivo + '.';
  }
  // ribasso da un giorno all'altro sulla stessa asta (stesso id)
  if (prima && prima.prezzoBase > 0 && a.prezzoBase > 0 && prima.prezzoBase > a.prezzoBase) {
    corti.prezzoPrecedente = prima.prezzoBase;
    corti.dataRibasso = oggi;
  } else if (prima && prima.prezzoPrecedente > a.prezzoBase && prima.prezzoBase === a.prezzoBase) {
    corti.prezzoPrecedente = prima.prezzoPrecedente;
    corti.dataRibasso = prima.dataRibasso;
  }
  if (det) {
    corti.stima = det.stima;
    corti.termineOfferte = det.termineOfferte;
    corti.nFoto = det.fotoTotali || (det.foto ? det.foto.length : 0);
    corti.annoProcedura = det.annoProcedura;
    corti.dettaglio = det.dettaglio;
    if (det.rialzo > 0) corti.rialzo = det.rialzo;
  }
  if (corti.rialzo == null) corti.rialzo = prezzo(x.rialzoMinimo);
  return { scheda: pulito(scheda), corti: pulito(corti) };
}

// Arricchisce in place le aste (quelle del PVP raccolte ora, con a._pvp) e restituisce le schede (dati lunghi).
// Le aste senza _pvp (fonte non raccolta in questa esecuzione) conservano campi corti e dati lunghi precedenti.
// Non scrive i pezzi: li scrive la raccolta dopo il punteggio (scriviSchede), con il record completo.
export async function arricchisci({ aste, prima = [], oggi, cartella, fileIndice, maxDettagli = 600, log = console.log, rete = true,
  scadenzaDettagli = Infinity, primaPaginaIndice = 0, leggiDettaglio, paginaIndice } = {}) {
  const inizio = Date.now();
  const vecchieSchede = await leggiSchede(cartella);
  const primaPerId = new Map(prima.map((a) => [a.id, a]));
  const pvp = aste.filter((a) => a._pvp);
  const stat = { richiesteStorico: 0, richiesteDettagli: 0, dettagliNuovi: 0, dettagliConservati: 0, schedeConservate: 0, catene: 0, ambigue: 0, schedeLette: vecchieSchede.size };

  // 1. storico dei tentativi
  let gruppi = null;
  if (pvp.length) {
    let indice = null;
    if (rete) {
      const r = await aggiornaIndice({ file: fileIndice, oggi, log, primaPagina: primaPaginaIndice, ...(paginaIndice ? { pagina: paginaIndice } : {}) });
      indice = r.indice; stat.richiesteStorico = r.richieste; stat.indice = indice ? { vendite: indice.righe.length, completo: indice.completo } : null;
    } else indice = await leggiIndice(fileIndice);
    if (indice) {
      const vendite = indice.righe.map(daRiga);
      for (const a of pvp) vendite.push(daRiga(riga(a._pvp)));
      gruppi = raggruppa(vendite);
    } else log('  storico: indice non disponibile, niente catene dei tentativi');
  }

  // 2. dettagli nuovi (prima i pubblicati negli ultimi 3 giorni, poi le aste più vicine)
  let nuovi = new Map();
  if (pvp.length && rete && maxDettagli > 0) {
    const daLeggere = ordina(pvp.filter((a) => !daVecchia(vecchieSchede.get(a.id))), oggi);
    log(`  dettagli: ${pvp.length - daLeggere.length} già letti, ${daLeggere.length} da leggere, ne leggo al massimo ${maxDettagli}`);
    const r = await scarica(daLeggere.map((a) => a._pvp.id), { max: maxDettagli, log, scadenza: scadenzaDettagli, ...(leggiDettaglio ? { leggi: leggiDettaglio } : {}) });
    nuovi = r.dettagli; stat.richiesteDettagli = r.richieste; stat.dettagliNuovi = r.dettagli.size; stat.dettagliFermo = r.fermo;
  }

  // 3. schede e campi corti
  const schede = new Map();
  for (const a of aste) {
    if (!a._pvp) {
      const v = vecchieSchede.get(a.id);
      if (v) {
        const s = {};
        for (const k of LUNGHI) if (v[k] !== undefined) s[k] = v[k];
        if (v.dettaglio && !a.dettaglio) a.dettaglio = v.dettaglio;
        schede.set(a.id, s); stat.schedeConservate++;
      }
      continue;
    }
    for (const k of CORTI) delete a[k];
    const v = daRiga(riga(a._pvp));
    const storia = gruppi ? catena(v, gruppi, oggi) : null;
    if (storia && storia.ambigua) stat.ambigue++;
    else if (storia && storia.tentativo > 1) stat.catene++;
    const nuovo = nuovi.get(a._pvp.id);
    if (!nuovo && daVecchia(vecchieSchede.get(a.id))) stat.dettagliConservati++;
    const { scheda, corti } = componi(a, { vecchiaScheda: vecchieSchede.get(a.id), nuovoDettaglio: nuovo, prima: primaPerId.get(a.id), storia, oggi });
    Object.assign(a, corti);
    schede.set(a.id, scheda);
  }
  stat.durataSec = Math.round((Date.now() - inizio) / 1000);
  return { schede, stat };
}

// Punteggio affare su tutte le aste, dopo arricchimento e storico: zone dalle perizie di tutte le aste, poi per ogni
// asta valore, costo, sconto e punteggio (campi corti, uniti all'asta) e il dettaglio per la scheda (Map id → oggetto).
export function valutaTutte(aste, T) {
  for (const a of aste) for (const k of CAMPI_PUNTEGGIO) delete a[k];
  const zone = Punteggio.indiceZone(aste);
  const dettagli = new Map();
  for (const a of aste) {
    const r = Punteggio.valuta(a, { T, zone });
    Object.assign(a, Punteggio.compatto(r));
    const d = {};
    if (r.valore) {
      d.valoreEtichetta = r.valore.etichetta;
      if (r.valore.controlli && r.valore.controlli.length) d.controlli = r.valore.controlli;
      if (r.valore.zona) d.zona = r.valore.zona;
    }
    if (r.parti) d.parti = r.parti;
    if (r.mancanti && r.mancanti.length) d.mancanti = r.mancanti;
    dettagli.set(a.id, d);
  }
  return { zone, dettagli };
}

// Record completo per il pezzo: tutti i campi corti dell'elenco, poi i dati lunghi (che prevalgono: descrizione
// completa, rge 'numero/anno', rischi con la prova), poi il dettaglio del punteggio.
export function record(a, campi, lunghi = null, punteggio = null) {
  const o = {};
  for (const c of campi) {
    const v = a[c];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && !v.length && c !== 'rischi') continue;
    o[c] = v;
  }
  if (lunghi) for (const [k, v] of Object.entries(lunghi)) if (v !== undefined && v !== null) o[k] = v;
  if (punteggio) for (const k of DAL_PUNTEGGIO) if (punteggio[k] !== undefined) o[k] = punteggio[k];
  return o;
}
