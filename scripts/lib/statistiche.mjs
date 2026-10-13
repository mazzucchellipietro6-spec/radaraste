// Statistiche di aggiudicazione dagli esiti REALI delle vendite passate (indice del Portale delle Vendite Pubbliche,
// data/storico-indice.json, costruito da scripts/lib/storico.mjs). Servono allo "Stratega d'asta" (js/stratega.js)
// per dire quanto spesso, in passato, un'asta simile ha avuto almeno un offerente.
//
// Metodo (lo stesso testo, più corto, finisce nel campo "metodo" del file generato):
// - si contano solo le vendite con data < oggi − 15 giorni (gli esiti si registrano in ritardo);
// - esito: AGGIU → aggiudicata; ASDES → deserta; nessun esito ma lo stesso lotto torna in vendita più tardi → deserta
//   (non aggiudicata); nessun esito e nessun tentativo successivo → ignota; SOSPE → esclusa;
// - tentativo k = posizione nella catena dello stesso lotto (tribunale + procedura + lotto, le sospese non contano),
//   ricostruita con catena() di storico.mjs: le catene ambigue o senza comune/indirizzo restano fuori dalle fasce per
//   tentativo ma contano nel totale del gruppo;
// - p = aggiudicate / (aggiudicate + deserte), solo con almeno 30 esiti noti; pMin e pMax mettono le ignote prima
//   tutte tra le non aggiudicate e poi tutte tra le aggiudicate.
// Il prezzo di aggiudicazione NON è disponibile (vedi storico.mjs): qui si misura solo se c'è stato un offerente.
//
// Limite verificato sull'indice reale (13/10/2026): la quota di «aggiudicata» tra gli esiti registrati cala con l'età della
// vendita (circa 0,3 nelle ultime settimane, quasi 0 nei mesi precedenti, dove restano soprattutto le deserte), e tra
// marzo 2025 e gennaio 2026 l'indice è quasi vuoto. Per questo oltre all'intero periodo (gruppi, totale) si calcola lo
// stesso conteggio sulle ultime 4 settimane prima del margine (recenti), e le avvertenze lo dicono con i numeri.
//
// Uso diretto: node scripts/lib/statistiche.mjs [--indice data/storico-indice.json] [--uscita data/statistiche.js]
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { CAMPI_INDICE, leggiIndice, raggruppa, catena, normalizzaComune } from './storico.mjs';

export const MARGINE_GIORNI = 15;
export const MINIMO_CAMPIONE = 30;
// ultime settimane prima del margine: lì gli esiti «aggiudicata» non sono ancora spariti dal portale (vedi avvertenze)
export const FINESTRA_RECENTE_GIORNI = 28;
export const FASCE = ['1', '2', '3', '4+'];
export const GRUPPI = ['residenziale', 'altri-immobili', 'veicoli', 'beni'];
export const NOMI_GRUPPI = {
  residenziale: 'immobili residenziali',
  'altri-immobili': 'altri immobili (commerciali, industriali, terreni e altro)',
  veicoli: 'veicoli e nautica',
  beni: 'altri beni mobili'
};
const VEICOLI = new Set(['AUTOVEICOLI_E_CICLI', 'NAUTICA']);
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/* ---------- piccoli aiuti ---------- */

const piuGiorni = (data, g) => { const d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + g); return d.toISOString().slice(0, 10); };
const tre = (x) => Math.round(x * 1000) / 1000;
const dataIt = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '');
const meseIt = (m) => MESI[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4);

// Gruppo statistico di una vendita dell'indice. Le vendite di tipo "I" (immobili) con categoria non residenziale
// (commerciale, industriale, "altra categoria", impianto sportivo...) sono "altri immobili", come in js/stratega.js.
export function gruppoCategoria(categoria, tipo) {
  const c = String(categoria || '');
  if (c === 'IMMOBILE_RESIDENZIALE') return 'residenziale';
  if (c.startsWith('IMMOBILE_') || tipo === 'I') return 'altri-immobili';
  if (VEICOLI.has(c)) return 'veicoli';
  return 'beni';
}

export const fascia = (k) => (k >= 4 ? '4+' : String(k));

const vuoto = () => ({ aggiudicate: 0, deserte: 0, ignote: 0 });

// conteggi → { aggiudicate, deserte, ignote, n, p, pMin, pMax } (p null sotto i 30 esiti noti)
export function proporzioni(c) {
  const noti = c.aggiudicate + c.deserte, n = noti + c.ignote;
  return {
    aggiudicate: c.aggiudicate, deserte: c.deserte, ignote: c.ignote, n,
    p: noti >= MINIMO_CAMPIONE ? tre(c.aggiudicate / noti) : null,
    pMin: n ? tre(c.aggiudicate / n) : null,
    pMax: n ? tre((c.aggiudicate + c.ignote) / n) : null
  };
}

// Mesi interi dell'indice con molte meno vendite del solito (meno del 20% della mediana mensile): lì le catene
// si spezzano, quindi vanno dichiarati. date: le date delle vendite ('AAAA-MM-GG').
// Restituisce intervalli [{ dal: 'AAAA-MM', al: 'AAAA-MM', vendite }].
export function buchi(date, dal, al) {
  const perMese = new Map();
  for (const d of date) { const m = String(d || '').slice(0, 7); if (m) perMese.set(m, (perMese.get(m) || 0) + 1); }
  const mesi = [];
  // solo i mesi interi tra "dal" e "al" (il primo e l'ultimo sono parziali)
  for (let d = new Date(dal.slice(0, 7) + '-15T12:00:00Z'); ; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const m = d.toISOString().slice(0, 7);
    if (m >= al.slice(0, 7)) break;
    if (m > dal.slice(0, 7)) mesi.push(m);
  }
  if (mesi.length < 3) return [];
  const conti = mesi.map((m) => perMese.get(m) || 0);
  const ordinati = conti.slice().sort((a, b) => a - b);
  const mediana = ordinati[ordinati.length >> 1];
  const out = [];
  mesi.forEach((m, i) => {
    if (conti[i] >= mediana * 0.2) return;
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.prossimo === m) { ultimo.al = m; ultimo.vendite += conti[i]; }
    else out.push({ dal: m, al: m, vendite: conti[i] });
    out[out.length - 1].prossimo = mesi[i + 1];
  });
  return out.map(({ prossimo, ...b }) => b);
}

function intervalloIt(b) { return b.dal === b.al ? 'di ' + meseIt(b.dal) : 'da ' + meseIt(b.dal) + ' a ' + meseIt(b.al); }
const pc = (x) => String(Math.round(x * 1000) / 10).replace('.', ',') + '%';

function testoMetodo(dal, al) {
  return 'Per ogni vendita del Portale delle Vendite Pubbliche tenuta dal ' + dataIt(dal) + ' al ' + dataIt(al) + ' (almeno ' + MARGINE_GIORNI +
    ' giorni fa) conta l\'esito registrato: «aggiudicata» vuol dire almeno un offerente, «deserta» è anche la vendita senza esito il cui lotto ' +
    '(stesso tribunale, procedura e numero di lotto) torna in vendita più tardi, e senza esito né tentativo successivo l\'esito è ignoto. ' +
    'p usa solo gli esiti noti (se sono almeno ' + MINIMO_CAMPIONE + '); pMin conta tutte le ignote come non aggiudicate e pMax come aggiudicate. ' +
    'Il tentativo è la posizione del lotto nella sua catena (le vendite sospese non contano), ma l\'indice parte dal ' + dataIt(dal) +
    ': i lotti già in vendita prima risultano a un tentativo più basso del vero, e le vendite recenti senza un tentativo successivo restano ignote.';
}

const nuovoConteggio = () => ({ ...vuoto(), tentativi: Object.fromEntries(FASCE.map((f) => [f, vuoto()])) });
const chiudi = (c) => ({ ...proporzioni(c), tentativi: Object.fromEntries(FASCE.map((f) => [f, proporzioni(c.tentativi[f])])) });

// Conta gli esiti delle vendite con data in [dal, al) per gruppo e fascia di tentativo.
function contaEsiti(vendite, { dal, al, esito, tentativo }) {
  const gruppi = Object.fromEntries(GRUPPI.map((g) => [g, nuovoConteggio()])), totale = nuovoConteggio();
  let prima = '', ultima = '', senzaTentativo = 0;
  for (const v of vendite) {
    if (!v.data || v.data >= al || (dal && v.data < dal)) continue;
    const e = esito(v);
    if (!e) continue;
    const g = gruppi[gruppoCategoria(v.categoria, v.tipo)];
    g[e]++; totale[e]++;
    if (!prima || v.data < prima) prima = v.data;
    if (v.data > ultima) ultima = v.data;
    const k = tentativo(v);
    if (k) { g.tentativi[fascia(k)][e]++; totale.tentativi[fascia(k)][e]++; } else senzaTentativo++;
  }
  return { prima, ultima, senzaTentativo, gruppi: Object.fromEntries(GRUPPI.map((g) => [g, chiudi(gruppi[g])])), totale: chiudi(totale) };
}

/* ---------- calcolo ---------- */

// indice: JSON di data/storico-indice.json; oggi: 'AAAA-MM-GG'
export function statisticheAggiudicazione(indice, { oggi } = {}) {
  if (!indice || !Array.isArray(indice.righe)) throw new Error('indice delle vendite non valido');
  if (!oggi) oggi = new Date().toISOString().slice(0, 10);
  const campi = Array.isArray(indice.campi) && indice.campi.length ? indice.campi : CAMPI_INDICE;
  const pos = Object.fromEntries(CAMPI_INDICE.map((c) => [c, campi.indexOf(c)]));
  const limite = piuGiorni(oggi, -MARGINE_GIORNI);
  // oggetti come quelli di daRiga() (solo i campi usati da catena), costruiti senza Object.fromEntries: è il passo più lento
  const vendite = new Array(indice.righe.length);
  for (let i = 0; i < indice.righe.length; i++) {
    const r = indice.righe[i];
    vendite[i] = { id: r[pos.id], tribunale: r[pos.tribunale], procedura: r[pos.procedura], lotto: r[pos.lotto], data: r[pos.data], prezzo: r[pos.prezzo],
      esito: r[pos.esito], comune: r[pos.comune], via: r[pos.via], tipo: r[pos.tipo], categoria: r[pos.categoria] };
  }
  const gruppi = raggruppa(vendite);

  // doppioni: stesso lotto, stesso giorno, stesso comune e stesso prezzo = la stessa vendita pubblicata due volte.
  // Si tiene quella con l'esito (catena() fa la stessa scelta) e le altre puntano a lei.
  const canonica = new Map();   // id → vendita tenuta
  const doppioni = new Set();
  for (const lista of gruppi.values()) {
    if (lista.length < 2) continue;
    const visti = new Map();
    for (const v of lista) {
      const k = v.data + '|' + normalizzaComune(v.comune) + '|' + Math.round(Number(v.prezzo) || 0);
      const g = visti.get(k);
      if (!g) { visti.set(k, v); continue; }
      const tieni = !g.esito && v.esito ? v : g, togli = tieni === g ? v : g;
      visti.set(k, tieni);
      doppioni.add(togli.id);
      canonica.set(togli.id, tieni);
    }
    // le catene di doppioni (A→B→C) puntano tutte all'ultima tenuta
    for (const v of lista) if (canonica.has(v.id)) { let c = canonica.get(v.id); while (canonica.has(c.id)) c = canonica.get(c.id); canonica.set(v.id, c); }
  }
  const radice = (id) => (canonica.has(id) ? canonica.get(id).id : id);

  // catene: tentativo di ogni vendita e vendite seguite da un tentativo successivo dello stesso lotto
  const tentativi = new Map();  // id → k (solo per catene ricostruite con sicurezza)
  const seguite = new Set();    // id delle vendite che hanno un tentativo successivo
  for (const v of vendite) {
    if (doppioni.has(v.id)) continue;
    const c = catena(v, gruppi, oggi, { max: Infinity });
    if (!c || c.ambigua) continue;
    tentativi.set(v.id, c.tentativo);
    for (const s of c.storico) seguite.add(radice(s[3]));
  }

  const unica = vendite.filter((v) => !doppioni.has(v.id));
  const esclusi = { doppioni: doppioni.size, recenti: 0, sospese: 0, primaDelPeriodo: 0 };
  const perMese = {};
  for (const v of unica) {
    if (!v.data || v.data >= limite) { esclusi.recenti++; continue; }
    if (indice.dal && v.data < indice.dal) { esclusi.primaDelPeriodo++; continue; }
    const m = v.data.slice(0, 7);
    const x = perMese[m] || (perMese[m] = [0, 0, 0, 0]);   // [aggiudicate, deserte, senza esito, sospese] come registrate dal PVP
    x[v.esito === 'AGGIU' ? 0 : v.esito === 'ASDES' ? 1 : v.esito === 'SOSPE' ? 3 : 2]++;
    if (v.esito === 'SOSPE') esclusi.sospese++;
  }
  const regole = {
    esito: (v) => (v.esito === 'SOSPE' ? null : v.esito === 'AGGIU' ? 'aggiudicate' : v.esito === 'ASDES' || seguite.has(v.id) ? 'deserte' : 'ignote'),
    tentativo: (v) => tentativi.get(v.id)
  };
  const tutto = contaEsiti(unica, { dal: indice.dal || null, al: limite, ...regole });
  const dalRecenti = piuGiorni(limite, -FINESTRA_RECENTE_GIORNI);
  const recenti = contaEsiti(unica, { dal: indice.dal && indice.dal > dalRecenti ? indice.dal : dalRecenti, al: limite, ...regole });

  const dal = indice.dal || tutto.prima || null;
  const al = tutto.ultima || piuGiorni(limite, -1);
  const buchiIndice = dal && indice.al ? buchi(vendite.map((v) => v.data), dal, indice.al) : [];
  const avvertenze = [];
  if (buchiIndice.length) {
    avvertenze.push('Nell\'indice mancano quasi tutte le vendite ' + buchiIndice.map(intervalloIt).join(' e ') +
      ': lì le catene si interrompono, quindi alcuni tentativi risultano più bassi del vero e alcune vendite senza esito restano ignote invece che deserte.');
  }
  const pr = recenti.totale.p, pt = tutto.totale.p;
  if (pr != null && pt != null && pr > pt * 1.5 + 0.02) {
    avvertenze.push('Le aggiudicazioni registrate calano con l\'età della vendita: tra gli esiti noti sono il ' + pc(pr) + ' nelle ultime ' + (FINESTRA_RECENTE_GIORNI / 7) +
      ' settimane (' + dataIt(recenti.prima) + ' – ' + dataIt(recenti.ultima) + ') e solo il ' + pc(pt) + ' nell\'intero periodo: per le vendite più vecchie il portale ' +
      'conserva soprattutto le deserte. La p dell\'intero periodo è quindi sottostimata; il blocco «recenti» è il riferimento più vicino al vero, ma con molti esiti ancora ignoti.');
  }
  avvertenze.push('Il prezzo di aggiudicazione non è pubblicato: si misura solo se qualcuno ha offerto, non quanto.');
  const blocco = (x) => ({ periodo: { dal: x.prima || null, al: x.ultima || null },
    fonte: x.prima ? 'Portale delle Vendite Pubbliche – esiti delle vendite dal ' + dataIt(x.prima) + ' al ' + dataIt(x.ultima) : 'Portale delle Vendite Pubbliche – nessuna vendita nel periodo',
    senzaTentativo: x.senzaTentativo, gruppi: x.gruppi, totale: x.totale });
  return {
    versione: 1,
    aggiornato: indice.aggiornato || null,
    calcolato: oggi,
    fonte: 'Portale delle Vendite Pubbliche – esiti delle vendite dal ' + dataIt(dal) + ' al ' + dataIt(al),
    url: indice.fonte || null,
    periodo: { dal, al },
    limite, margineGiorni: MARGINE_GIORNI, minimoCampione: MINIMO_CAMPIONE,
    metodo: testoMetodo(dal, al),
    avvertenze,
    buchi: buchiIndice,
    esclusi, senzaTentativo: tutto.senzaTentativo,
    nomi: NOMI_GRUPPI,
    perMese: Object.fromEntries(Object.keys(perMese).sort().map((m) => [m, perMese[m]])),
    gruppi: tutto.gruppi,
    totale: tutto.totale,
    recenti: { giorni: FINESTRA_RECENTE_GIORNI, ...blocco(recenti) }
  };
}

/* ---------- file per il sito ---------- */

// Legge l'indice, calcola e scrive fileUscita come "window.STATISTICHE = {...};" (scrittura atomica).
// Restituisce l'oggetto, oppure null se l'indice manca o non è leggibile.
export async function scriviStatistiche(fileIndice, fileUscita, oggi) {
  const indice = await leggiIndice(fileIndice);
  if (!indice) return null;
  const s = statisticheAggiudicazione(indice, { oggi: oggi || new Date().toISOString().slice(0, 10) });
  const testa = '/* STATISTICHE DI AGGIUDICAZIONE – generate da scripts/lib/statistiche.mjs il ' + s.calcolato + ' dagli esiti reali del\n' +
    ' * Portale delle Vendite Pubbliche (' + s.periodo.dal + ' – ' + s.periodo.al + '). Non modificarlo a mano: viene riscritto dalla raccolta.\n' +
    ' * Usate dallo Stratega d\'asta (js/stratega.js). Metodo nel campo "metodo", limiti dei dati in "avvertenze". */\n';
  await mkdir(path.dirname(fileUscita), { recursive: true });
  await writeFile(fileUscita + '.tmp', testa + 'window.STATISTICHE = ' + JSON.stringify(s) + ';\n');
  await rename(fileUscita + '.tmp', fileUscita);
  return s;
}

// lettura del file generato (per gli script Node che non hanno window)
export async function leggiStatistiche(file) {
  try {
    const t = await readFile(file, 'utf8');
    return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch { return null; }
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return path.resolve(i > 0 ? process.argv[i + 1] : d); };
  const inizio = Date.now();
  const s = await scriviStatistiche(arg('--indice', 'data/storico-indice.json'), arg('--uscita', 'data/statistiche.js'), new Date().toISOString().slice(0, 10));
  if (!s) { console.log('✗ indice delle vendite assente o non leggibile'); process.exitCode = 1; }
  else {
    const riga = (nome, x) => `${nome.padEnd(22)} n ${String(x.n).padStart(6)}  aggiudicate ${String(x.aggiudicate).padStart(5)}  deserte ${String(x.deserte).padStart(6)}  ignote ${String(x.ignote).padStart(6)}  p ${x.p ?? '–'}  [${x.pMin}–${x.pMax}]`;
    for (const [titolo, b] of [['intero periodo: ' + s.fonte, s], ['ultime ' + s.recenti.giorni + ' giorni: ' + s.recenti.fonte, s.recenti]]) {
      console.log(titolo);
      console.log(riga('totale', b.totale));
      for (const g of GRUPPI) {
        console.log(riga(g, b.gruppi[g]));
        for (const f of FASCE) console.log(riga('  tentativo ' + f, b.gruppi[g].tentativi[f]));
      }
    }
    for (const a of s.avvertenze) console.log('! ' + a);
    console.log(`✓ ${Math.round((Date.now() - inizio) / 100) / 10} s`);
  }
}
