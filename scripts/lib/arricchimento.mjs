// Arricchimento delle aste del PVP, dopo la raccolta:
//   - descrizione completa (descLotto della ricerca, gratis) → scheda a pezzi, superficie e rischi;
//   - storico dei tentativi (indice delle vendite passate) → tentativo, deserte, primo prezzo, ribasso;
//   - dettaglio pubblico /restricted (al massimo N per raccolta) → foto, allegati, catasto, cauzione, termine offerte...;
//   - ribassi da un giorno all'altro (stesso id, prezzo base sceso).
// Le schede (dati lunghi) vanno in <cartella dell'output>/dettagli/XX.js; nell'elenco leggero restano solo campi corti.
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { aggiornaIndice, leggiIndice, riga, daRiga, raggruppa, catena } from './storico.mjs';
import { estrai, descrizione, scarica, ordina } from './dettaglio-pvp.mjs';

const require = createRequire(import.meta.url);
const Dettagli = require('../../js/dettagli.js');
const Estrai = require('../../js/estrai.js');

// rischi che hanno senso per ogni categoria
const RISCHI_PER = {
  immobile: ['abusi', 'quota', 'superficie', 'condominio', 'vincoli', 'degrado', 'occupazione', 'agricolo'],
  auto: ['chiavi', 'documenti', 'marcia', 'quota'],
  moto: ['chiavi', 'documenti', 'marcia', 'quota'],
  beni: ['quota']
};

// campi della scheda che vengono dal dettaglio (si conservano da una raccolta all'altra)
const DAL_DETTAGLIO = ['letto', 'descrizione', 'foto', 'fotoTotali', 'allegati', 'catasto', 'vani', 'piano', 'mq', 'cauzione', 'cauzionePerc',
  'contoSpese', 'contoSpesePerc', 'modalita', 'tipoVendita', 'rialzo', 'stima', 'termineOfferte', 'rge', 'annoProcedura', 'rito', 'esito'];

export const cartellaSchede = (fileAste) => path.join(path.dirname(fileAste), 'dettagli');
const nomePezzo = (k) => k + '.js';

export async function leggiSchede(cartella) {
  const out = new Map();
  let file = [];
  try { file = await readdir(cartella); } catch { return out; }
  for (const f of file) {
    const m = f.match(/^([0-9a-f]{2})\.js$/);
    if (!m) continue;
    try {
      const p = Dettagli.analizza(await readFile(path.join(cartella, f), 'utf8'));
      if (p) for (const [id, s] of Object.entries(p)) out.set(id, s);
    } catch { /* pezzo illeggibile: si rifà */ }
  }
  return out;
}

export async function scriviSchede(cartella, schede) {
  await mkdir(cartella, { recursive: true });
  const pezzi = {};
  for (let i = 0; i < 256; i++) pezzi[('0' + i.toString(16)).slice(-2)] = {};
  for (const [id, s] of schede) pezzi[Dettagli.chiave(id)][id] = s;
  let byte = 0;
  for (const [k, p] of Object.entries(pezzi)) {
    const t = Dettagli.testo(k, p);
    byte += Buffer.byteLength(t);
    const f = path.join(cartella, nomePezzo(k));
    await writeFile(f + '.tmp', t);
    await rename(f + '.tmp', f);
  }
  return byte;
}

const pulito = (o) => { for (const k of Object.keys(o)) if (o[k] === null || o[k] === undefined || (Array.isArray(o[k]) && !o[k].length)) delete o[k]; return o; };

// Calcola scheda e campi corti di un'asta del PVP (funzione pura: tests/dettaglio.test.mjs).
//   a: asta convertita (con a._pvp); vecchiaScheda: scheda salvata in precedenza; nuovoDettaglio: corpo /restricted letto ora;
//   prima: la stessa asta nel file precedente (campi corti); storia: risultato di catena() o null.
export function componi(a, { vecchiaScheda = null, nuovoDettaglio = null, prima = null, storia = null, oggi }) {
  const x = a._pvp || {};
  let det = null;
  if (nuovoDettaglio) det = estrai(nuovoDettaglio, { oggi, descLotto: x.descLotto });
  else if (vecchiaScheda && vecchiaScheda.letto) det = Object.fromEntries(DAL_DETTAGLIO.filter((k) => vecchiaScheda[k] !== undefined).map((k) => [k, vecchiaScheda[k]]));
  const scheda = det ? { ...det } : {};
  if (!scheda.descrizione) scheda.descrizione = descrizione(x.descLotto) || undefined;
  if (scheda.rialzo == null && x.rialzoMinimo > 0) scheda.rialzo = x.rialzoMinimo;
  const testo = scheda.descrizione || '';
  const ammessi = RISCHI_PER[a.categoria] || RISCHI_PER.beni;
  const rischi = Estrai.rischi(testo).filter((r) => ammessi.includes(r.chiave));
  if (rischi.length) scheda.rischi = rischi;
  const corti = {};
  if (a.categoria === 'immobile') {
    const s = scheda.mq ? null : Estrai.superficie(testo);
    corti.superficieMq = scheda.mq || (s && s.mq) || null;
  }
  if (rischi.length) corti.rischi = rischi.map((r) => r.chiave);
  if (storia && !storia.ambigua) {
    corti.tentativo = storia.tentativo;
    if (storia.tentativo > 1 || storia.storico.length) {
      corti.deserte = storia.deserte;
      if (storia.primoPrezzo != null) corti.primoPrezzo = storia.primoPrezzo;
      if (storia.ribasso != null) corti.ribasso = storia.ribasso;
      scheda.storico = storia.storico;
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
    corti.nFoto = det.foto ? det.foto.length : 0;
    corti.annoProcedura = det.annoProcedura;
    corti.dettaglio = det.letto;
  }
  return { scheda: pulito(scheda), corti: pulito(corti) };
}

// Arricchisce in place le aste (solo quelle del PVP raccolte ora, con a._pvp) e scrive le schede a pezzi.
// Le aste senza _pvp (fonte non raccolta in questa esecuzione) conservano campi corti e scheda precedenti.
export async function arricchisci({ aste, prima = [], oggi, fileAste, fileIndice, maxDettagli = 600, log = console.log, rete = true, scadenzaDettagli = Infinity }) {
  const inizio = Date.now();
  const cartella = cartellaSchede(fileAste);
  const vecchieSchede = await leggiSchede(cartella);
  const primaPerId = new Map(prima.map((a) => [a.id, a]));
  const pvp = aste.filter((a) => a._pvp);
  const stat = { richiesteStorico: 0, richiesteDettagli: 0, dettagliNuovi: 0, schedeConservate: 0, catene: 0, ambigue: 0 };

  // 1. storico dei tentativi
  let gruppi = null;
  if (pvp.length) {
    let indice = null;
    if (rete) {
      const r = await aggiornaIndice({ file: fileIndice, oggi, log });
      indice = r.indice; stat.richiesteStorico = r.richieste;
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
    const daLeggere = ordina(pvp.filter((a) => !(vecchieSchede.get(a.id) || {}).letto), oggi);
    log(`  dettagli: ${pvp.length - daLeggere.length} già letti, ${daLeggere.length} da leggere, ne leggo al massimo ${maxDettagli}`);
    const r = await scarica(daLeggere.map((a) => a._pvp.id), { max: maxDettagli, log, scadenza: scadenzaDettagli });
    nuovi = r.dettagli; stat.richiesteDettagli = r.richieste; stat.dettagliNuovi = r.dettagli.size; stat.dettagliFermo = r.fermo;
  }

  // 3. schede e campi corti
  const schede = new Map();
  for (const a of aste) {
    if (!a._pvp) {
      const s = vecchieSchede.get(a.id);
      if (s) { schede.set(a.id, s); stat.schedeConservate++; }
      continue;
    }
    const v = daRiga(riga(a._pvp));
    const storia = gruppi ? catena(v, gruppi, oggi) : null;
    if (storia && storia.ambigua) stat.ambigue++;
    else if (storia && storia.tentativo > 1) stat.catene++;
    const { scheda, corti } = componi(a, { vecchiaScheda: vecchieSchede.get(a.id), nuovoDettaglio: nuovi.get(a._pvp.id), prima: primaPerId.get(a.id), storia, oggi });
    Object.assign(a, corti);
    if (Object.keys(scheda).length) schede.set(a.id, scheda);
  }
  for (const a of aste) delete a._pvp;
  stat.byteSchede = await scriviSchede(cartella, schede);
  stat.schede = schede.size;
  stat.durataSec = Math.round((Date.now() - inizio) / 1000);
  return stat;
}
