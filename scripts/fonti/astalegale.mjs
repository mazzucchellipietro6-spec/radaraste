// Astalegale.net – annunci di vendite giudiziarie pubblicati direttamente da Astalegale.
// Legge le pagine pubbliche di ricerca (/immobili e /mobili), le stesse che vede un visitatore
// senza login: il sito le genera lato server e incorpora i risultati nel blocco JSON
// "__NUXT_DATA__" della pagina, da cui si leggono i dati (48 annunci per pagina, il massimo
// accettato dal sito). Nessuna scheda viene aperta: l'elenco contiene già tribunale,
// procedura (numero/anno), data, prezzo base e offerta minima.
//
// Si leggono solo gli annunci propri di Astalegale (filtro del sito "sitoEsterno=false"):
// quelli ripresi dal Portale Vendite Pubbliche sono già raccolti dal modulo pvp.mjs e in
// parte sono riservati agli abbonati "PRO" (dati oscurati con XX): non vengono letti.
// Ordine per data d'asta decrescente: la lettura si ferma alla prima pagina con aste passate.
import { richiesta } from '../lib/http.mjs';
import { provincia, titolo as maiuscole } from '../lib/luoghi.mjs';

export const NOME = 'Astalegale';
const BASE = 'https://www.astalegale.net';
const RICERCHE = [
  { percorso: '/immobili', etichetta: 'immobili' },
  { percorso: '/mobili', etichetta: 'beni mobili e aziende' }
];
const DIMENSIONE_PAGINA = 48;     // valori accettati dal sito: 12, 24, 48 (oltre torna a 12)
const INTERVALLO_MS = 3000;       // una richiesta ogni 3 secondi
const MAX_RICHIESTE = 380;        // tetto giornaliero complessivo (~20 minuti)
const ANNI_MAX_FUTURO = 3;        // date oltre questo orizzonte sono errori di inserimento

/* ---- lettura del blocco __NUXT_DATA__ (formato "devalue" di Nuxt) ---- */

// Ricostruisce l'oggetto dal formato appiattito: ogni numero dentro array/oggetti è
// l'indice di un altro elemento; gli array che iniziano con una stringa sono tipi speciali.
export function leggiPayload(html) {
  const m = String(html || '').match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let piatto;
  try { piatto = JSON.parse(m[1]); } catch { return null; }
  if (!Array.isArray(piatto)) return null;
  const fatti = new Map();
  const valore = (i) => {
    if (typeof i !== 'number' || i < 0) return undefined; // -1 = undefined, altri negativi = NaN/Infinity
    if (fatti.has(i)) return fatti.get(i);
    const x = piatto[i];
    let r;
    if (Array.isArray(x)) {
      if (typeof x[0] === 'string') {
        const tipo = x[0];
        if (/^(Shallow)?(Reactive|Ref)$/.test(tipo)) r = valore(x[1]);
        else if (tipo === 'Date') r = x[1];
        else if (tipo === 'Set') { r = []; fatti.set(i, r); for (const j of x.slice(1)) r.push(valore(j)); }
        else r = null; // Map, RegExp, B64, EmptyRef…: non servono
      } else {
        r = []; fatti.set(i, r);
        for (const j of x) r.push(valore(j));
      }
    } else if (x && typeof x === 'object') {
      r = {}; fatti.set(i, r);
      for (const [k, j] of Object.entries(x)) r[k] = valore(j);
    } else r = x;
    fatti.set(i, r);
    return r;
  };
  return valore(0);
}

// Dal payload della pagina di ricerca estrae l'elenco degli annunci e i dati di paginazione.
export function risultatiRicerca(payload) {
  const dati = payload && payload.data;
  if (!dati || typeof dati !== 'object') return null;
  const chiave = Object.keys(dati).find((k) => /^\/webapi\/Search_/.test(k));
  const r = chiave && dati[chiave] && dati[chiave].results;
  if (!r || !Array.isArray(r.currentPage)) return null;
  return { annunci: r.currentPage, totale: r.totalResults ?? null, pagina: r.pageIndex ?? null, dimensione: r.pageSize ?? null };
}

/* ---- conversione di un annuncio ---- */

const due = (n) => String(n).padStart(2, '0');
const spazi = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// "16/12/2026 - 10:30" → { data: '2026-12-16', ora: '10:30' }; dati oscurati ("XX/XX/XXXX") → null
export function dataOra(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return { data: `${m[3]}-${due(m[2])}-${due(m[1])}`, ora: m[4] ? `${due(m[4])}:${m[5]}` : '' };
}

// "€ 114.609,38", "40.500,00", "-" → 114609.38, 40500, null
export function importo(v) {
  if (typeof v === 'number') return isFinite(v) && v > 0 ? v : null;
  const t = String(v ?? '').replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return isFinite(n) && n > 0 ? n : null;
}

// Fra i "beni mobili" il sito elenca anche terreni e fabbricati di genere "Altro" o "Azienda".
const IMMOBILE = /terren|abitazion|appartament|fabbricat|villa|\bbox\b|autorimess|garage|magazzin|negozi|uffic|capannon|edificabil|deposit/i;

export function categoria(x) {
  if (x.genere === 'Immobili') return 'immobile';
  const t = `${x.tipologia || ''}`;
  if (x.genere !== 'Mobili' && IMMOBILE.test(t)) return 'immobile';
  if (/motocicl|ciclomotor|scooter|\bmoto\b/i.test(t)) return 'moto';
  if (/autovettur|autoveicol|automezz|autocarr|furgon|veicol|\bauto\b/i.test(t)) return 'auto';
  return 'beni';
}

// "Tribunale di PRATO" / "TRIBUNALE ORDINARIO Enna" / "Pavia (ex Voghera)" / "Bolzano - Bozen" → solo la città
export function tribunale(s) {
  const t = spazi(s).replace(/^tribunale\s+(ordinario\s+)?(d[ie]\s+|d')?/i, '')
    .replace(/\s*\(.*\)\s*$/, '').split(/\s+[-–]\s+|\s*\/\s*/)[0].trim();
  if (!t) return '';
  return t === t.toUpperCase() ? maiuscole(t) : t;
}

// Numero di procedura come mostrato dal sito ("230/2015"); "XXX/XXXX" o vuoto → ''
export function procedura(s) {
  const t = spazi(s).replace(/\s*\/\s*/, '/');
  return /\d/.test(t) && !/X/i.test(t) ? t : '';
}

// Toglie dal testo libero indirizzi e-mail/PEC e numeri di telefono, poi accorcia a 200 caratteri.
export function breve(s, max = 200) {
  let t = spazi(String(s ?? '')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '')
    .replace(/(\+39[\s.]?)?\b(0\d{1,3}|3\d{2})[\s./-]?\d{5,8}\b/g, '')); // fissi (0…) e cellulari (3…)
  if (t.length > max) t = t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return t;
}

const comuneDa = (s) => { const t = spazi(s); return t && t === t.toUpperCase() ? maiuscole(t) : t; };

// Negli annunci di Astalegale (codice "B…") il campo "titolo" è l'indirizzo del lotto; nelle vendite
// mobiliari online degli IVG (codice "S…") è la descrizione del bene.
const titoloEIndirizzo = (x) => !/^S/i.test(String(x.id));

function indirizzo(x) {
  if (!titoloEIndirizzo(x)) return '';
  const t = spazi(x.titolo).replace(/,?\s*Italia$/i, '');
  return t.length > 2 && !/X{3,}|omissis/i.test(t) ? t.slice(0, 90) : '';
}

function titoloAsta(x, comune) {
  const tipo = spazi(x.tipologia);
  if (titoloEIndirizzo(x)) return [tipo || x.genere, comune].filter(Boolean).join(' – ');
  let t = spazi(x.titolo).replace(/^n[°º.]?\s*1\s+/i, '');
  if (t.length > 110) t = t.slice(0, 110).replace(/\s+\S*$/, '') + '…';
  if (t.length < 4) t = [tipo || 'Bene mobile', comune].filter(Boolean).join(' – ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const coordinata = (v) => (typeof v === 'number' && isFinite(v) && v !== 0 ? Math.round(v * 1e5) / 1e5 : null);

// Converte un annuncio dell'elenco in un oggetto asta. Restituisce null se mancano i dati
// essenziali o se l'annuncio è oscurato (riservato agli abbonati).
export function converti(x) {
  if (!x || !x.id || x.isPro) return null;
  const quando = dataOra(x.dataAsta);
  if (!quando) return null;
  const trib = tribunale(x.tribunale);
  const p = provincia(x.provincia) || provincia(trib);
  const comune = comuneDa(x.comune);
  const pos = x.posizione || {};
  const idPvp = (String(x.externalDetailUrl || '').match(/idAnnuncio=(\d+)/) || [])[1] || null;
  return {
    id: 'al-' + x.id,
    titolo: titoloAsta(x, comune),
    categoria: categoria(x),
    tipo: spazi(x.tipologia),
    regione: p ? p.regione : spazi(x.regione),
    provincia: p ? p.sigla : '',
    comune,
    indirizzo: indirizzo(x),
    tribunale: trib,
    rge: procedura(x.proceduraNumeroAnno),
    fonte: NOME,
    prezzoBase: importo(x.prezzoNum ?? x.prezzo),
    offertaMinima: importo(x.offertaMinima),
    dataAsta: quando.data,
    ora: quando.ora,
    stato: 'nd',                // lo stato di occupazione non è nell'elenco
    linkAvviso: `${BASE}/Aste/Detail/${encodeURIComponent(x.friendlyId || x.id)}`,
    linkPerizia: '',
    linkPdf: '',
    lat: coordinata(pos.lat),
    lng: coordinata(pos.lng),
    descrizione: breve(x.descrizione),
    idPvp                       // numero dell'annuncio sul PVP, se il sito lo indica (utile per i doppioni)
  };
}

// true se le date della pagina sono in ordine non crescente (come richiesto con sort=DataAstaDesc)
export function inOrdineDecrescente(date) {
  for (let i = 1; i < date.length; i++) if (date[i] > date[i - 1]) return false;
  return true;
}

export const urlRicerca = (percorso, pagina) =>
  `${BASE}${percorso}?sitoEsterno=false&limit=${DIMENSIONE_PAGINA}&sort=DataAstaDesc&page=${pagina}`;

/* ---- raccolta ---- */

export async function raccogli({ oggi, maxPagine = Infinity, log = console.log }) {
  const limite = new Date(oggi); limite.setFullYear(limite.getFullYear() + ANNI_MAX_FUTURO);
  const fine = limite.toISOString().slice(0, 10);
  const aste = []; const visti = new Set();
  let richieste = 0, scartateData = 0, senzaData = 0, interrotta = false;
  const note = [];

  for (const ric of RICERCHE) {
    let totale = null, lette = 0, pagina = 1, motivoFine = 'fine elenco', conDate = false;
    for (; ; pagina++) {
      if (pagina > maxPagine) { motivoFine = `limite di ${maxPagine} pagine richiesto`; break; }
      if (richieste >= MAX_RICHIESTE) { motivoFine = `tetto di ${MAX_RICHIESTE} richieste raggiunto`; interrotta = true; break; }
      const html = await richiesta(urlRicerca(ric.percorso, pagina), { intervalloMs: INTERVALLO_MS, intestazioni: { Accept: 'text/html' } });
      richieste++;
      const r = risultatiRicerca(leggiPayload(html));
      if (!r) throw new Error(`risposta inattesa da Astalegale (${ric.percorso}, pagina ${pagina}): elenco non trovato nella pagina`);
      if (totale === null) {
        totale = r.totale;
        if (r.dimensione && r.dimensione !== DIMENSIONE_PAGINA) log(`  Astalegale ${ric.etichetta}: il sito restituisce ${r.dimensione} annunci per pagina invece di ${DIMENSIONE_PAGINA}`);
      }
      if (!r.annunci.length) break;
      lette += r.annunci.length;
      const date = [];
      for (const x of r.annunci) {
        const a = converti(x);
        if (!a) { senzaData++; continue; }
        date.push(a.dataAsta);
        if (a.dataAsta < oggi) continue;
        if (a.dataAsta > fine) { scartateData++; continue; }
        if (visti.has(a.id)) continue;
        visti.add(a.id);
        aste.push(a);
      }
      if (pagina % 20 === 0) log(`  Astalegale ${ric.etichetta} pagina ${pagina}: ${aste.length} aste future finora`);
      // in ordine decrescente vengono prima le aste future, poi quelle passate, infine quelle senza data:
      // un'asta passata in fondo alla pagina, o una pagina tutta senza data, chiude l'elenco utile
      const ultima = date[date.length - 1];
      if (ultima && ultima < oggi && inOrdineDecrescente(date)) { motivoFine = 'raggiunte le aste già passate'; break; }
      if (!date.length && conDate) { motivoFine = 'raggiunti gli annunci senza data'; break; }
      if (date.length) conDate = true;
      if (totale !== null && lette >= totale) break;
    }
    log(`  Astalegale ${ric.etichetta}: ${lette} annunci letti su ${totale ?? '?'} (${motivoFine})`);
    note.push(`${ric.etichetta}: ${lette} annunci letti su ${totale ?? '?'}`);
  }
  log(`  Astalegale: ${aste.length} aste future in ${richieste} richieste (scartate ${scartateData} con data oltre il ${fine}, ${senzaData} senza data o oscurate)`);
  return {
    aste,
    nota: `${aste.length} aste con data dal ${oggi} (solo annunci propri di Astalegale; ${note.join('; ')}).` +
      (interrotta ? ` Raccolta fermata al tetto di ${MAX_RICHIESTE} richieste.` : '') +
      (scartateData ? ` ${scartateData} scartate per data palesemente errata.` : '')
  };
}
