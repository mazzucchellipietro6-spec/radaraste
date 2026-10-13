// Storico dei tentativi di vendita (Portale Vendite Pubbliche).
//
// 1. INDICE delle vendite passate (data/storico-indice.json, NON pubblicato): una riga compatta per vendita
//    degli ultimi ~3 anni, letta dalla ricerca pubblica del PVP (POST, 1000 vendite per pagina, ordinate per
//    data decrescente, una richiesta ogni 2,5 secondi). Se l'indice esiste si scaricano solo le vendite dopo
//    l'ultima data presente meno 60 giorni, così si aggiornano anche gli esiti registrati in ritardo.
// 2. CATENE: lo stesso lotto, a ogni nuovo tentativo, ha un id nuovo. La catena si ricostruisce con
//    tribunale + numero di procedura + numero di lotto + tipo di lotto, separando le procedure omonime di anni
//    diversi con il comune e la via; se la catena è ambigua (indirizzi diversi, prezzi che salgono) non si collega.
//
// Le funzioni di calcolo sono pure (testate in tests/storico.test.mjs); solo aggiornaIndice() usa la rete.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { richiesta } from './http.mjs';

export const RICERCA = 'https://pvp.giustizia.it/ric-496b258c-986a1b71/ric-ms/ricerca/vendite';
const DIMENSIONE_PAGINA = 1000;
const INTERVALLO_MS = 2500;
export const ANNI = 3;
export const RIPASSO_GIORNI = 60;
export const CAMPI_INDICE = ['id', 'tribunale', 'procedura', 'lotto', 'data', 'prezzo', 'esito', 'comune', 'via', 'tipo', 'categoria'];
export const ESITI = { ASDES: 'deserta', AGGIU: 'aggiudicata', SOSPE: 'sospesa' };

/* ---------- normalizzazioni ---------- */

const semplice = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// "LOTTO 001" → "1", "Lotto unico" → "U", "3 bis" → "3BIS"
export function normalizzaLotto(s) {
  let t = semplice(s).replace(/\b(lotto|lotti|n\.?|nr\.?|numero|num\.?)\b/g, ' ').replace(/[^a-z0-9]/g, '');
  if (!t || t === 'unico' || t === 'u') return 'U';
  t = t.replace(/^0+(?=\d)/, '');
  return t.toUpperCase().slice(0, 12);
}

export const normalizzaComune = (s) => semplice(s).replace(/[^a-z]/g, '');

const PAROLE_VUOTE = new Set(['via', 'viale', 'piazza', 'piazzale', 'largo', 'corso', 'vicolo', 'strada', 'localita', 'loc', 'frazione', 'fraz',
  'contrada', 'borgo', 'della', 'delle', 'dello', 'degli', 'dei', 'del', 'snc', 'civico', 'numero', 'italia', 'interno', 'scala', 'piano',
  'senza', 'provinciale', 'statale', 'comunale', 'vicinale', 'traversa', 'zona', 'snc', 'sito', 'sita', 'presso', 'angolo']);

// parole significative di un indirizzo (senza tipo di strada, numeri, sigle e nome del comune)
export function paroleVia(via, comune) {
  const viaComune = new Set(semplice(comune).split(/[^a-z]+/).filter(Boolean));
  return new Set(semplice(via).split(/[^a-z]+/).filter((w) => w.length >= 3 && !PAROLE_VUOTE.has(w) && !viaComune.has(w)));
}

// due indirizzi sono compatibili se uno manca o se hanno almeno una parola significativa in comune
// (con "severo" devono esserci entrambi)
export function stessaVia(a, b, severo = false) {
  if (!a.size || !b.size) return !severo;
  for (const w of a) if (b.has(w)) return true;
  return false;
}

/* ---------- indice ---------- */

// Riga dell'indice da un elemento della ricerca del PVP.
export function riga(x) {
  const ind = x.indirizzo || {};
  return [
    x.id,
    x.codiceTribunale || '',
    String(x.procedura ?? '').trim().slice(0, 20),
    normalizzaLotto(x.numeroLotto),
    x.dataVendita || '',
    typeof x.prezzoBaseAsta === 'number' ? x.prezzoBaseAsta : null,
    x.esito || null,
    String(ind.citta || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    String(ind.via || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    String(x.tipoLotto || '').charAt(0),
    x.categoriaLotto || ''
  ];
}

export const daRiga = (r) => Object.fromEntries(CAMPI_INDICE.map((c, i) => [c, r[i]]));

const piuGiorni = (data, g) => { const d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + g); return d.toISOString().slice(0, 10); };
const menoAnni = (data, a) => { const d = new Date(data + 'T12:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() - a); return d.toISOString().slice(0, 10); };

export async function leggiIndice(file) {
  try {
    const j = JSON.parse(await readFile(file, 'utf8'));
    if (j.versione !== 1 || !Array.isArray(j.righe)) return null;
    return j;
  } catch { return null; }
}

// Una riga per vendita, così il file resta leggibile e confrontabile.
export async function scriviIndice(file, indice) {
  await mkdir(path.dirname(file), { recursive: true });
  const { righe, ...testa } = indice;
  const testo = JSON.stringify({ ...testa, campi: CAMPI_INDICE }).slice(0, -1) + ',"righe":[\n' + righe.map((r) => JSON.stringify(r)).join(',\n') + '\n]}\n';
  await writeFile(file + '.tmp', testo);
  await rename(file + '.tmp', file);
}

// Unisce le righe scaricate a quelle già presenti: per le date coperte dallo scaricamento valgono le nuove
// (gli esiti cambiano, le vendite cancellate spariscono); il resto si conserva. Si tengono solo le vendite
// passate (data < oggi) e non più vecchie di "dal".
export function unisciRighe(vecchie, nuove, { copertoDa, oggi, dal }) {
  const perId = new Map();
  for (const r of vecchie) if (!(copertoDa && r[4] >= copertoDa)) perId.set(r[0], r);
  for (const r of nuove) perId.set(r[0], r);
  return [...perId.values()].filter((r) => r[4] && r[4] < oggi && r[4] >= dal)
    .sort((a, b) => (b[4] < a[4] ? -1 : b[4] > a[4] ? 1 : b[0] - a[0]));
}

// Aggiorna (o costruisce) l'indice. `pagina(n)` restituisce il corpo di una pagina della ricerca (iniettabile nei test).
// Se lo scaricamento si interrompe si salva comunque ciò che è stato letto: un indice incompleto viene
// ricostruito per intero alla raccolta successiva (le righe già presenti non vanno perse).
// `primaPagina`: da quale pagina partire. Le prime pagine contengono solo vendite future (già lette dalla raccolta):
// la raccolta passa quante sono, e si parte una pagina prima del confine. Se la pagina di partenza non contiene
// nessuna vendita futura (il confine potrebbe essere più indietro) si riparte da 0.
export async function aggiornaIndice({ file, oggi, anni = ANNI, log = console.log, pagina = paginaPvp, maxPagine = Infinity, primaPagina = 0 } = {}) {
  const vecchio = await leggiIndice(file);
  const dal = menoAnni(oggi, anni);
  const completo = Boolean(vecchio && vecchio.completo && vecchio.righe.length);
  const ultima = completo ? vecchio.righe.reduce((m, r) => (r[4] > m ? r[4] : m), '') : null;
  // fin dove scendere: ultima data presente meno 60 giorni (aggiornamento) oppure 3 anni fa (costruzione)
  const fino = ultima && piuGiorni(ultima, -RIPASSO_GIORNI) > dal ? piuGiorni(ultima, -RIPASSO_GIORNI) : dal;
  log(`  storico: ${vecchio ? vecchio.righe.length + ' vendite nell\'indice' + (completo ? '' : ' (incompleto)') : 'indice assente'}; scarico le vendite fino al ${fino}`);
  const nuove = [];
  let finito = false, piuVecchia = null, richieste = 0, errore = null;
  let partenza = Math.max(0, primaPagina | 0);
  try {
    for (let n = partenza; n < partenza + maxPagine; n++) {
      const b = await pagina(n);
      richieste++;
      if (!b || !Array.isArray(b.content)) throw new Error('risposta inattesa dalla ricerca del PVP');
      if (n === partenza && partenza > 0 && b.content.length && !(b.content[0].dataVendita >= oggi)) {
        log(`  storico: la pagina ${n + 1} non contiene vendite future, riparto dalla prima`);
        partenza = 0; n = -1; continue;
      }
      if (n === partenza && partenza > 0) log(`  storico: salto le prime ${partenza} pagine (solo vendite future, già lette dalla raccolta)`);
      for (const x of b.content) {
        if (!x.dataVendita || x.dataVendita >= oggi) continue;
        if (x.dataVendita < fino) { finito = true; continue; }
        nuove.push(riga(x));
        if (!piuVecchia || x.dataVendita < piuVecchia) piuVecchia = x.dataVendita;
      }
      if (n % 25 === 0) log(`  storico pagina ${n + 1}: ${nuove.length} vendite passate lette (fino al ${piuVecchia || '–'})`);
      if (finito || b.last || !b.content.length) { finito = true; break; }
    }
  } catch (e) {
    errore = e;
    log(`  ✗ storico interrotto: ${e.message}`);
  }
  if (!nuove.length && !vecchio) return { indice: null, richieste, errore };
  // date coperte per intero dallo scaricamento: fino a "fino" se si è arrivati in fondo, altrimenti dal giorno dopo la più vecchia letta
  const copertoDa = finito ? fino : piuVecchia ? piuGiorni(piuVecchia, 1) : '9999-12-31';
  const righe = unisciRighe(vecchio ? vecchio.righe : [], nuove, { copertoDa, oggi, dal });
  // completo = nessun buco da "dal" a ieri: era completo prima (le date non riscaricate restano quelle vecchie) o è arrivato a "dal"
  const ok = completo || (finito && fino <= dal);
  const indice = { versione: 1, aggiornato: new Date().toISOString(), completo: ok, dal: ok ? dal : copertoDa, al: piuGiorni(oggi, -1), fonte: RICERCA, righe };
  await scriviIndice(file, indice);
  log(`  storico: ${righe.length} vendite passate nell'indice (${richieste} richieste${ok ? '' : '; incompleto, si completerà alla prossima raccolta'})`);
  return { indice, richieste, errore };
}

export async function paginaPvp(n, { dimensione = DIMENSIONE_PAGINA } = {}) {
  // ordinamento per data e poi per id: le pagine restano stabili anche tra vendite dello stesso giorno
  const url = `${RICERCA}?language=it&page=${n}&size=${dimensione}&sort=dataVendita,desc&sort=id,desc`;
  const r = await richiesta(url, { metodo: 'POST', corpo: '{}', intestazioni: { 'Content-Type': 'application/json', Accept: 'application/json' }, json: true, intervalloMs: INTERVALLO_MS });
  return r && r.body;
}

/* ---------- catene dei tentativi ---------- */

const chiave = (v) => v.tribunale && v.procedura && v.lotto ? `${v.tribunale}|${v.procedura}|${v.lotto}|${v.tipo}` : null;

// vendite: oggetti { id, tribunale, procedura, lotto, data, prezzo, esito, comune, via, tipo } (passate + future)
export function raggruppa(vendite) {
  const gruppi = new Map();
  for (const v of vendite) {
    const k = chiave(v);
    if (!k) continue;
    if (!gruppi.has(k)) gruppi.set(k, []);
    gruppi.get(k).push(v);
  }
  return gruppi;
}

const TOLLERANZA = 0.01;       // un prezzo può "salire" al massimo dell'1% (arrotondamenti)
const RIBASSO_MAX = 0.6;       // tra due tentativi consecutivi il prezzo non scende più del 60%

// Catena dei tentativi precedenti di una vendita. Restituisce:
//   { tentativo, storico: [[data, prezzo, esito, id]...] (dal più vecchio), deserte, primoPrezzo, ribasso }
//   oppure { ambigua: true, motivo } se il tentativo precedente non si può collegare con sicurezza.
export function catena(v, gruppi, oggi, { max = 10 } = {}) {
  const k = chiave(v);
  if (!k) return null;
  const cv = normalizzaComune(v.comune), pv = paroleVia(v.via, v.comune);
  // senza comune né indirizzo non si distinguono le procedure omonime: tentativo sconosciuto
  if (!cv && !pv.size) return null;
  // candidati: stessa chiave, data precedente, stesso comune (se il comune manca da una delle due parti serve
  // almeno una parola dell'indirizzo in comune); per i beni mobili anche la stessa categoria (per gli immobili
  // la categoria a volte cambia da un tentativo all'altro: bastano indirizzo e prezzi)
  const candidati = (gruppi.get(k) || []).filter((x) => {
    if (x.id === v.id || !x.data || x.data >= v.data) return false;
    if (v.tipo !== 'I' && v.categoria && x.categoria && v.categoria !== x.categoria) return false;
    const cx = normalizzaComune(x.comune);
    if (cv && cx) return cx === cv;
    return stessaVia(paroleVia(x.via, x.comune), pv, true);
  });
  // una vendita per data: due lotti diversi nello stesso giorno con la stessa chiave = ambiguità
  const perData = new Map();
  for (const x of candidati) {
    const g = perData.get(x.data);
    if (!g) { perData.set(x.data, x); continue; }
    if (x.prezzo > 0 && g.prezzo > 0 && Math.abs(x.prezzo - g.prezzo) > TOLLERANZA * Math.max(x.prezzo, g.prezzo)) perData.set(x.data, { ...g, doppia: true });
    else if (!g.esito && x.esito) perData.set(x.data, { ...x, doppia: g.doppia });
  }
  const date = [...perData.keys()].sort().reverse();
  const precedenti = [];
  let successivo = v, motivo = null;
  for (const d of date) {
    const x = perData.get(d);
    if (x.doppia) { motivo = 'due vendite diverse nello stesso giorno'; break; }
    if (!stessaVia(paroleVia(x.via, x.comune), pv)) { motivo = 'indirizzo diverso'; break; }
    if (x.prezzo > 0 && successivo.prezzo > 0) {
      if (successivo.prezzo > x.prezzo * (1 + TOLLERANZA)) { motivo = 'prezzo che sale'; break; }
      if (successivo.prezzo < x.prezzo * (1 - RIBASSO_MAX)) { motivo = 'ribasso troppo forte'; break; }
    }
    precedenti.push(x);
    // il confronto dei prezzi si fa con l'ultimo tentativo svolto con un prezzo valido (prezzo 0 = dato mancante)
    if (x.esito !== 'SOSPE' && x.prezzo > 0) successivo = x;
  }
  if (!precedenti.length && motivo) return { ambigua: true, motivo };
  precedenti.reverse(); // dal più vecchio
  const tentativo = 1 + precedenti.filter((x) => x.esito !== 'SOSPE').length;
  let deserte = 0;
  // deserta: esito "asta deserta" oppure nessun esito registrato ma seguita da un nuovo tentativo (qui sempre vero)
  for (const x of precedenti) if (x.data < oggi && (x.esito === 'ASDES' || !x.esito)) deserte++;
  const out = { tentativo, deserte, storico: precedenti.slice(-max).map((x) => [x.data, x.prezzo ?? null, ESITI[x.esito] || null, x.id]) };
  if (motivo) out.parziale = motivo;
  const validi = precedenti.filter((x) => x.esito !== 'SOSPE' && x.prezzo > 0);
  if (validi.length) {
    out.primoPrezzo = validi[0].prezzo;
    const prec = validi[validi.length - 1];
    if (v.prezzo > 0) out.ribasso = Math.round((1 - v.prezzo / prec.prezzo) * 1000) / 1000;
  }
  return out;
}

// Uso diretto: node scripts/lib/storico.mjs [--indice data/storico-indice.json]  (costruisce o aggiorna l'indice)
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--indice');
  const file = path.resolve(i > 0 ? process.argv[i + 1] : 'data/storico-indice.json');
  const inizio = Date.now();
  const { indice, richieste, errore } = await aggiornaIndice({ file, oggi: new Date().toISOString().slice(0, 10) });
  console.log(`✓ ${indice ? indice.righe.length : 0} vendite, ${richieste} richieste, ${Math.round((Date.now() - inizio) / 1000)} s${errore ? ' (interrotto: ' + errore.message + ')' : ''}`);
  if (errore) process.exitCode = 1;
}
