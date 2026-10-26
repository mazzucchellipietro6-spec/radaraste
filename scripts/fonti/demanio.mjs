// Agenzia del Demanio – sezione pubblica "Gare e aste".
// Legge le prime pagine dell'elenco (ordinato per data di pubblicazione), tiene solo le
// vendite con termine non ancora scaduto e apre la scheda di ciascuna per luogo e documenti.
// Il prezzo base è solo nel PDF dell'avviso: non viene ricavato (resta vuoto); il PDF è in linkPdf.
// Data dell'asta: il giorno scritto nell'avviso; il termine per le offerte è in termineOfferte.
import { richiesta } from '../lib/http.mjs';
import { provincia, titolo as maiuscole } from '../lib/luoghi.mjs';

export const NOME = 'Agenzia del Demanio';
const BASE = 'https://www.agenziademanio.it';
const SEZIONI = [
  { percorso: '/it/gare-aste/immobiliare/index.html', categoria: 'immobile' },
  { percorso: '/it/gare-aste/beni-mobili-e-veicoli-confiscati/index.html', categoria: 'beni' }
];
const MAX_PAGINE = 8;          // ~160 gare più recenti per sezione
const INTERVALLO_MS = 3000;
const MESI = { gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12 };
const MESI_EN = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

const testo = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const due = (n) => String(n).padStart(2, '0');

function dataIt(s) { // "06 novembre 2026 12:00"
  const m = String(s || '').match(/(\d{1,2})\s+([a-zà]+)\s+(\d{4})(?:\s+(\d{1,2}:\d{2}))?/i);
  if (!m || !MESI[m[2].toLowerCase()]) return null;
  return { data: `${m[3]}-${due(MESI[m[2].toLowerCase()])}-${due(m[1])}`, ora: m[4] || '' };
}
function dataEn(s) { // "Fri Nov 06 12:00:00 CET 2026"
  const m = String(s || '').match(/[A-Z][a-z]{2}\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}:\d{2})[^\d]+(\d{4})/);
  return m && MESI_EN[m[1]] ? { data: `${m[4]}-${due(MESI_EN[m[1]])}-${due(m[2])}`, ora: m[3] } : null;
}

// giorno dell'asta scritto nell'avviso: "Asta pubblica del giorno 11 novembre 2026", "del giorno 09.06.2026 alle ore 10:00"
export function giornoAsta(t) {
  const m = String(t || '').match(/\b(?:del|il|nel)\s+giorno\s+(\d{1,2})(?:\s+([a-zà]+)\s+|[./-](\d{1,2})[./-])(\d{4})(?:[^.;:]{0,25}?\bore\s+(\d{1,2})[:.](\d{2}))?/i);
  if (!m) return null;
  const mese = m[2] ? MESI[m[2].toLowerCase()] : Number(m[3]), giorno = Number(m[1]);
  if (!(mese >= 1 && mese <= 12) || !(giorno >= 1 && giorno <= 31)) return null;
  return { data: `${m[4]}-${due(mese)}-${due(giorno)}`, ora: m[5] ? `${due(m[5])}:${m[6]}` : '' };
}

const eVendita = (t) => /vendit|alienazion|asta pubblica/i.test(t) && !/locazion|concession|affitt/i.test(t);

function categoriaBene(t, base) {
  if (base === 'immobile') return 'immobile';
  if (/motocicl|ciclomotor|\bmoto\b|scooter/i.test(t)) return 'moto';
  if (/autovettur|autoveicol|veicol|\bauto\b|furgon|autocarr/i.test(t)) return 'auto';
  return 'beni';
}

/* Scheda di una gara (HTML già scaricato) → asta. La data dell'asta è il giorno scritto nell'avviso
 * ("Asta pubblica del giorno ..."); il termine per le offerte va in termineOfferte. Se l'avviso non scrive
 * il giorno dell'asta, dataAsta resta il termine per le offerte (come le schede del sito lo presentano). */
export function leggiScheda(h, url, cat, titoloElenco, termine, pubblicata) {
  const t = testo(h);
  const campo = (nome) => { const m = t.match(new RegExp(nome + ':\\s*(.+?)\\s+(?:Regione|Provincia|Comune|Struttura responsabile|Data pubblicazione|Termine per|Nominativo|Documenti|Tipologia|Descrizione)[^:]{0,60}:')); return m ? m[1].trim() : ''; };
  const p = provincia(campo('Provincia'));
  const descr = campo('Descrizione');
  const voceTermine = campo('Termine per la presentazione delle offerte');
  const scad = dataEn(voceTermine) || dataIt(voceTermine) || termine;
  const giorno = giornoAsta(titoloElenco + ' ' + descr);
  const asta = giorno && (!scad || giorno.data >= scad.data) ? giorno : null; // l'asta non può venire prima del termine
  const pdf = (h.match(/href="(\/export\/sites\/demanio\/download\/[^"]+\.pdf)"/i) || [])[1];
  return {
    id: 'dem-' + url.split('/').pop().slice(0, 80),
    titolo: titoloElenco.slice(0, 140),
    categoria: categoriaBene(titoloElenco + ' ' + descr, cat),
    tipo: campo('Tipologia'),
    regione: p ? p.regione : '',
    provincia: p ? p.sigla : '',
    comune: maiuscole(campo('Comune')),
    tribunale: '',
    fonte: NOME,
    prezzoBase: null,
    dataAsta: asta ? asta.data : scad ? scad.data : '',
    ora: asta ? asta.ora : scad ? scad.ora : '',
    termineOfferte: scad ? scad.data + (scad.ora ? 'T' + scad.ora : '') : '',
    pubblicata: pubblicata || '',
    stato: 'nd',
    linkAvviso: url,
    linkPdf: pdf ? BASE + pdf : '',
    descrizione: descr.slice(0, 200)
  };
}

async function scheda(url, cat, titoloElenco, termine, pubblicata) {
  return leggiScheda(await richiesta(url, { intervalloMs: INTERVALLO_MS }), url, cat, titoloElenco, termine, pubblicata);
}

export async function raccogli({ oggi, log = console.log }) {
  const aste = [];
  const unAnnoFa = new Date(oggi); unAnnoFa.setFullYear(unAnnoFa.getFullYear() - 1);
  const soglia = unAnnoFa.toISOString().slice(0, 10);
  for (const sez of SEZIONI) {
    const candidati = [];
    for (let p = 1; p <= MAX_PAGINE; p++) {
      const h = await richiesta(`${BASE}${sez.percorso}?p=${p}`, { intervalloMs: INTERVALLO_MS });
      const schede = [...h.matchAll(/<h2 class="card-title h4">([\s\S]*?)<\/h2>([\s\S]*?)href="(\/it\/gare-aste\/[^"]+\/gara\/[^"]+)"/g)];
      if (!schede.length) break;
      let vecchie = 0;
      for (const [, t, corpo, link] of schede) {
        const pubbl = dataIt((corpo.match(/Data Pubblicazione bando:\s*<\/strong>([^<]+)/i) || [])[1]);
        const termine = dataIt((corpo.match(/Termine per partecipare:\s*<\/strong>([^<]+)/i) || [])[1]);
        if (pubbl && pubbl.data < soglia) vecchie++;
        const tit = testo(t);
        if (!eVendita(tit + ' ' + testo((corpo.match(/Tipo procedura:\s*<\/strong>([^<]+)/i) || [])[1]))) continue;
        if (!termine || termine.data < oggi) continue;
        candidati.push({ url: BASE + link, titolo: tit, termine, pubblicata: pubbl ? pubbl.data : '' });
      }
      if (vecchie === schede.length) break; // pagina tutta più vecchia di un anno
    }
    for (const c of candidati) {
      const a = await scheda(c.url, sez.categoria, c.titolo, c.termine, c.pubblicata);
      if ((a.termineOfferte || a.dataAsta).slice(0, 10) >= oggi) aste.push(a); // si può ancora offrire
    }
    log(`  Demanio ${sez.percorso.split('/')[3]}: ${candidati.length} vendite in corso`);
  }
  return { aste, nota: `${aste.length} vendite con termine dal ${oggi}. Prezzo base indicato solo nel PDF dell'avviso.` };
}
