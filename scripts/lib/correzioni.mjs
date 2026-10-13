// Correzioni della raccolta trovate dal controllo dei dati (funzioni pure, tests/correzioni.test.mjs):
//   coordinate fuori dall'Italia o lontane dalla provincia, biciclette tra le auto, prezzi a zero,
//   aste di oggi già iniziate (ora di Roma), titoli con prefissi o tutti in maiuscolo,
//   offerta minima sopra il prezzo base (dato della fonte: si tiene ma si segnala), nomi dei file collegati.
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const GEO = require('../../data/geo.js');

/* ---------- coordinate ---------- */

export const RIQUADRO = { latMin: 35.3, latMax: 47.2, lngMin: 6.5, lngMax: 18.6 };
export const DISTANZA_MAX_KM = 150;

export function distanzaKm(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lng2 - lng1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

const numero = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN);

// { lat, lng, scarto }: scarto = 'fuori-italia' (fuori dal riquadro, compresi (0,0) e (1,1)) o 'lontana'
// (a più di 150 km dal capoluogo della provincia dell'asta); coordinate assenti → null senza scarto.
export function controllaCoordinate(latitudine, longitudine, sigla) {
  const lat = numero(latitudine), lng = numero(longitudine);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat: null, lng: null, scarto: null };
  const R = RIQUADRO;
  if (lat < R.latMin || lat > R.latMax || lng < R.lngMin || lng > R.lngMax) return { lat: null, lng: null, scarto: 'fuori-italia' };
  const p = sigla && GEO.province[sigla];
  if (p && distanzaKm(lat, lng, p.lat, p.lng) > DISTANZA_MAX_KM) return { lat: null, lng: null, scarto: 'lontana' };
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, scarto: null };
}

/* ---------- categoria: biciclette ---------- */

const BICI = /\b(?:bicicl\w*|bici\b|e-?bike\w*|mountain[\s-]*bike\w*|mtb\b|city[\s-]*bike\w*|velociped\w*)/i;
const VEICOLO = /\b(?:autovettur\w*|automobil\w*|autoveicol\w*|autocarr\w*|automezz\w*|furgon\w*|motocicl\w*|motoveicol\w*|ciclomotor\w*|scooter\w*|quadricicl\w*|trattor\w*|rimorch\w*|semirimorch\w*|camper|autocaravan\w*|minivan|autobus|targat\w*|targa|tg|auto|moto)\b/i;

// Lotto della categoria "Autoveicoli e cicli" fatto solo di biciclette (anche elettriche): va tra i beni.
// I lotti misti (biciclette e veicoli a motore) restano dove sono.
export function soloBiciclette(x) {
  if (!x || x.categoriaLotto !== 'AUTOVEICOLI_E_CICLI') return false;
  if ((x.categoriaBene || []).some((b) => /AUTOVETTUR|AUTOMEZZ|MOTOVEICOL|CICLOMOTOR/.test(b))) return false;
  const t = String(x.descLotto || '');
  return BICI.test(t) && !VEICOLO.test(t);
}

/* ---------- prezzi ---------- */

// 0, negativi, non numeri → null (dato mancante, non "gratis")
export const prezzo = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

export function anomalia(a) {
  if (a.prezzoBase > 0 && a.offertaMinima > 0 && a.offertaMinima > a.prezzoBase * 1.0001) return 'offerta-minima-sopra-base';
  return null;
}

/* ---------- ora di Roma ---------- */

const FORMATO_ROMA = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function adessoRoma(d = new Date()) {
  const p = Object.fromEntries(FORMATO_ROMA.formatToParts(d).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, ora: `${p.hour}:${p.minute}` };
}

// asta di una data passata, oppure di oggi con l'orario già raggiunto (ora di Roma)
export function giaIniziata(a, adesso) {
  if (!a.dataAsta) return false;
  if (a.dataAsta < adesso.data) return true;
  if (a.dataAsta > adesso.data) return false;
  const m = String(a.ora || '').match(/^(\d{1,2})[:.](\d{2})/);
  return Boolean(m) && `${m[1].padStart(2, '0')}:${m[2]}` <= adesso.ora;
}

/* ---------- titoli ---------- */

// "(Lotto n.1) - ", "Lotto unico -", "LOTTO 001:", "Bene 3 - ", "Lotto A) " (non "Lotto di terreno")
const NUM = '\\d+(?:[a-z](?![a-zà-ÿ]))?';
const PREFISSO = new RegExp('^\\s*[(\\[]?\\s*(?:lott[oi]|ben[ei])\\s*(?:n(?:r|um(?:ero)?)?\\s*[.°º]?\\s*)?' +
  '(?:unico(?![a-zà-ÿ])|' + NUM + '(?:\\s*(?:[-/,&]|e|ed)\\s*' + NUM + '|\\s*(?:bis|ter)(?![a-zà-ÿ]))*|(?:[a-z]|[ivx]{1,4})(?=\\s*[-–—:.)\\]]))' +
  '\\s*[)\\]]?\\s*(?:[-–—:.,;)]+\\s*)*', 'i');

export function togliPrefisso(t) {
  let s = String(t || '');
  for (let i = 0; i < 3; i++) {
    const n = s.replace(PREFISSO, '');
    if (n === s) break;
    s = n;
  }
  return s;
}

const SIGLE = new Set(Object.keys(GEO.province));
// parole e sigle che restano maiuscole
const MAIUSCOLE = new Set(['PVP', 'IVG', 'RGE', 'CTU', 'APE', 'SRL', 'SPA', 'SAS', 'IVA', 'NCEU', 'NCT', 'CEU', 'BMW', 'KTM', 'DAF', 'VW', 'BYD', 'MG', 'SUV',
  'GPL', 'TV', 'PC', 'LED', 'CNC', 'ATECO', 'IMU', 'ZTL', 'UE', 'DPR', 'SCIA', 'CILA', 'DIA', 'PEEP', 'ERP', 'ACI', 'PRA', 'SS', 'SP', 'SR', 'ASL', 'INPS', 'INAIL',
  'II', 'III', 'IV', 'VII', 'VIII', 'IX', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV']);
// sigle di provincia che sono anche parole comuni: maiuscole solo tra parentesi o dopo un CAP
const SIGLE_PAROLA = new Set(['AL', 'SI', 'NO', 'MI', 'TE', 'SO', 'VA', 'RE', 'CO', 'PO', 'AN', 'TO', 'BO', 'PE', 'FE', 'LE', 'IS', 'CE']);
const PARTICELLE = new Set(['di', 'del', 'della', 'delle', 'dei', 'degli', 'dello', 'de', 'da', 'dal', 'dalla', 'e', 'ed', 'in', 'al', 'alla', 'sul', 'sulla', 'a']);
const STRADA = /\b(via|viale|v\.le|piazza|p\.zza|piazzale|corso|c\.so|largo|vicolo|vico|localit[aà]|loc\.|frazione|fraz\.|contrada|c\.da|strada|borgo|lungomare|salita|traversa|regione|rione)\s+/gi;

export function tuttoMaiuscolo(t) {
  const lettere = String(t || '').replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (lettere.length < 10) return false;
  const maiu = lettere.replace(/[^A-ZÀ-Þ]/g, '').length;
  return maiu / lettere.length > 0.8;
}

const capitale = (w) => w.charAt(0).toUpperCase() + w.slice(1);

// Testo tutto maiuscolo → frase normale, con sigle di provincia, sigle note, codici (A/2, C220) e
// nome del comune dell'asta scritti bene. Il testo non maiuscolo resta com'è.
export function frase(t, { comune, provincia } = {}) {
  const s = String(t || '');
  if (!tuttoMaiuscolo(s)) return s;
  const parole = s.split(/(\s+)/);
  const out = parole.map((w, i) => {
    if (/^\s+$/.test(w) || !w) return w;
    const nudo = w.replace(/^[("'«\[]+|[)"'»\].,;:!?]+$/g, '');
    const prima = parole.slice(Math.max(0, i - 4), i).join('');
    if (/\d/.test(nudo)) {
      // codici e sigle con cifre restano come sono (A/2, C220, GJ123AB, 3A), il resto in minuscolo (MQ.208 → mq.208)
      return /^(?:[A-Z]\/\d+|[A-Z]{1,3}\d[\dA-Z]*|\d+[A-Z]{1,3}|[\d.,/°%€-]+)$/.test(nudo) ? w : w.toLowerCase();
    }
    if (MAIUSCOLE.has(nudo) || /^(?:[A-Z]\.){2,}[A-Z]?\.?$/.test(nudo)) return w;
    if (SIGLE.has(nudo)) {
      const traParentesi = /^\(/.test(w) && /\)/.test(w);
      const dopoCap = /\b\d{5}\b[^,;]*$/.test(prima);
      const ultima = i >= parole.length - 2 || /,$/.test(w);
      if (traParentesi || dopoCap || (ultima && (nudo === provincia || !SIGLE_PAROLA.has(nudo)))) return w;
    }
    return w.toLowerCase();
  });
  let r = out.join('');
  // inizio di frase: la prima lettera, e dopo un punto solo se chiude una parola vera (non "fg.", "n.", "N.C.E.U.")
  r = r.replace(/^([^A-Za-zÀ-ÿ]*)([a-zà-ÿ])/, (m, p, c) => p + c.toUpperCase())
    .replace(/([a-zà-ÿ]{5,}[.!?]\s+)([("'«]*)([a-zà-ÿ])/g, (m, a, p, c) => a + p + c.toUpperCase());
  // nome del comune dell'asta
  if (comune && comune.length >= 3) {
    const re = new RegExp('(^|[^A-Za-zÀ-ÿ])(' + comune.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]") + ')(?![A-Za-zÀ-ÿ])', 'g');
    r = r.replace(re, (m, a) => a + comune);
  }
  // nomi delle strade: "via delle rose n. 5" → "via delle Rose n. 5"
  r = r.replace(new RegExp(STRADA.source + "((?:[a-zà-ÿ'’]+\\s*){1,4})", 'gi'), (m, tipo, nomi) => {
    let fermo = false;
    const parti = nomi.split(/(\s+)/).map((w) => {
      if (fermo || /^\s+$/.test(w) || !w) return w;
      const low = w.toLowerCase();
      if (/^(n|nr|snc|piano|int|interno|scala|sc|civ|civico|km|nel|nei|sito|sita|siti|site|con|composto|composta|adibit\w*|ad|uso|foglio|fg|mapp\w*|part\w*|sub)$/.test(low.replace(/[.,;:]+$/, ''))) { fermo = true; return w; }
      if (PARTICELLE.has(low)) return w;
      return /^d['’]/.test(low) ? "d'" + capitale(low.slice(2)) : capitale(w);
    });
    return m.slice(0, m.length - nomi.length) + parti.join('');
  });
  return r;
}

/* ---------- file collegati all'output ---------- */

// data/aste.js → data/riepilogo.js + data/dettagli/; prova-aste.js → prova-aste-riepilogo.js + prova-aste-dettagli/
export function fileCollegati(file) {
  const dir = path.dirname(file), base = path.basename(file).replace(/\.js$/i, '');
  if (base === 'aste') return { riepilogo: path.join(dir, 'riepilogo.js'), dettagli: path.join(dir, 'dettagli') };
  return { riepilogo: path.join(dir, base + '-riepilogo.js'), dettagli: path.join(dir, base + '-dettagli') };
}
