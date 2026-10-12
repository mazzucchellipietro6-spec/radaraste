// Agenzia del Demanio – sezione pubblica "Gare e aste".
// Legge le prime pagine dell'elenco (ordinato per data di pubblicazione), tiene solo le
// vendite con termine non ancora scaduto e apre la scheda di ciascuna per luogo e documenti.
// Il prezzo base è solo nel PDF dell'avviso: non viene ricavato (resta vuoto); il PDF è in linkPdf.
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

const eVendita = (t) => /vendit|alienazion|asta pubblica/i.test(t) && !/locazion|concession|affitt/i.test(t);

function categoriaBene(t, base) {
  if (base === 'immobile') return 'immobile';
  if (/motocicl|ciclomotor|\bmoto\b|scooter/i.test(t)) return 'moto';
  if (/autovettur|autoveicol|veicol|\bauto\b|furgon|autocarr/i.test(t)) return 'auto';
  return 'beni';
}

async function scheda(url, cat, titoloElenco, termine, pubblicata) {
  const h = await richiesta(url, { intervalloMs: INTERVALLO_MS });
  const t = testo(h);
  const campo = (nome) => { const m = t.match(new RegExp(nome + ':\\s*(.+?)\\s+(?:Regione|Provincia|Comune|Struttura responsabile|Data pubblicazione|Termine per|Nominativo|Documenti|Tipologia|Descrizione)[^:]{0,60}:')); return m ? m[1].trim() : ''; };
  const p = provincia(campo('Provincia'));
  const scad = dataEn(campo('Termine per la presentazione delle offerte')) || termine;
  const pdf = (h.match(/href="(\/export\/sites\/demanio\/download\/[^"]+\.pdf)"/i) || [])[1];
  return {
    id: 'dem-' + url.split('/').pop().slice(0, 80),
    titolo: titoloElenco.slice(0, 140),
    categoria: categoriaBene(titoloElenco + ' ' + campo('Descrizione'), cat),
    tipo: campo('Tipologia'),
    regione: p ? p.regione : '',
    provincia: p ? p.sigla : '',
    comune: maiuscole(campo('Comune')),
    tribunale: '',
    fonte: NOME,
    prezzoBase: null,
    dataAsta: scad ? scad.data : '',
    pubblicata: pubblicata || '',
    ora: scad ? scad.ora : '',
    stato: 'nd',
    linkAvviso: url,
    linkPdf: pdf ? BASE + pdf : '',
    descrizione: campo('Descrizione').slice(0, 200)
  };
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
      if (a.dataAsta >= oggi) aste.push(a);
    }
    log(`  Demanio ${sez.percorso.split('/')[3]}: ${candidati.length} vendite in corso`);
  }
  return { aste, nota: `${aste.length} vendite con termine dal ${oggi}. Prezzo base indicato solo nel PDF dell'avviso.` };
}
