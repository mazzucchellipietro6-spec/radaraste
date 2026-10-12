// Fallco Aste (Zucchetti Software Giuridico): vendite telematiche di procedure concorsuali,
// esecuzioni e IVG, vendite non giudiziarie degli IVG (per esempio per conto di Comuni) e avvisi
// pubblicitari di vendite giudiziarie. Il portale separato "Vendite tra privati" non è nell'elenco.
// Il sito non offre un servizio JSON per l'elenco: si legge la pagina pubblica di ricerca
// (ricerca.html, 15 vendite per pagina, nessun login né captcha), che per ogni vendita mostra già
// titolo, prezzo base, data di inizio e di termine, tribunale e numero di procedura.
// Le schede delle singole vendite NON vengono aperte. robots.txt vieta solo /admin/.
//
// Volume: circa 11.000 vendite in corso = oltre 700 pagine, più del limite di ~400 richieste al giorno.
// Le sezioni sono quindi lette in ordine di priorità (immobili, veicoli, aziende, crediti, altro) e
// complete; i restanti beni mobili sono letti con le pagine rimaste, partendo dalle vendite che
// scadono prima. Ogni taglio è scritto nel log e nella nota.
import { richiesta } from '../lib/http.mjs';
import { provincia, titolo as maiuscole } from '../lib/luoghi.mjs';

export const NOME = 'Fallco Aste';
const BASE = 'https://www.fallcoaste.it';
const PER_PAGINA = 15;          // fisso lato sito
const INTERVALLO_MS = 3000;     // una richiesta ogni 3 secondi
const MAX_RICHIESTE = 390;      // pagine di elenco al giorno (~25 minuti)

// Filtri della ricerca del sito (codici delle categorie presi dalla pagina ricerca.html).
// "residua": sezione letta solo con le pagine rimaste, dalle vendite più vicine alla scadenza.
export const SEZIONI = [
  { nome: 'immobili', filtro: 'macro|527', categoria: 'immobile', tipo: 'Immobile' },
  { nome: 'moto', filtro: 'macro|591^cat0|592^cat1|595', categoria: 'moto', tipo: 'Motoveicolo' },
  { nome: 'veicoli', filtro: 'macro|591^cat0|592', categoria: 'auto', tipo: 'Autoveicolo' },
  { nome: 'aziende', filtro: 'macro|654', categoria: 'beni', tipo: 'Azienda o quote societarie' },
  { nome: 'crediti', filtro: 'macro|644', categoria: 'beni', tipo: 'Crediti e titoli' },
  { nome: 'altro', filtro: 'macro|662', categoria: 'beni', tipo: 'Marchi, brevetti e altro' },
  { nome: 'beni mobili', filtro: 'macro|591', categoria: 'beni', tipo: 'Beni mobili', residua: true }
];

const MOTO = /\b(motocicl|motociclett|motoveicol|ciclomotor|scooter|quadricicl|minimoto)/i;
// Indizi di un veicolo vero e proprio: nelle categorie veicoli del sito finiscono anche caschi,
// bauletti e abbigliamento, che restano "beni".
const VEICOLO = /\b(autovettur|autoveicol|autocarr|automezz|autobus|furgon|veicol|camper|autocaravan|trattor|rimorch|semirimorch|motrice|targ[ae]t[oa]|telaio|immatricol|cilindrat|alimentazion|gasolio|benzina|diesel|chilometr|km\s*\d)/i;

// Categoria e genere per le sezioni dei veicoli; le altre sezioni restano come sono.
export function categoriaVeicolo(sez, titolo, descrizione = '') {
  if (sez.categoria !== 'auto' && sez.categoria !== 'moto') return { categoria: sez.categoria, genere: sez.tipo };
  if (MOTO.test(titolo)) return { categoria: 'moto', genere: 'Motoveicolo' };
  if (VEICOLO.test(titolo + ' ' + descrizione)) return { categoria: sez.categoria, genere: sez.tipo };
  return { categoria: 'beni', genere: 'Beni mobili' };
}

/* ---- funzioni pure (esportate per i test) ---- */

const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', deg: '°', frac12: '½', hellip: '…' };

export function decodifica(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITA[e.toLowerCase()] ?? m;
  });
}

const testo = (h) => decodifica(String(h || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const due = (n) => String(n).padStart(2, '0');

// "12/10/2026 10:00" → { data: '2026-10-12', ora: '10:00', gma: '12/10/2026' }
export function dataOra(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return { data: `${m[3]}-${due(m[2])}-${due(m[1])}`, ora: m[4] ? `${due(m[4])}:${m[5]}` : '', gma: `${due(m[1])}/${due(m[2])}/${m[3]}` };
}

// "11.730,00" → 11730
export function numero(s) {
  const t = String(s || '').replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return null;
  const n = parseFloat(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// "Tribunale di Cosenza - Procedura n.132/2021" → { tribunale: 'Cosenza', rge: '132/2021' }
export function tribunaleProcedura(s) {
  const t = testo(s);
  const proc = (t.match(/Procedura\s+n[.°]?\s*([\w./-]+)/i) || [])[1] || '';
  const m = t.match(/^Tribunale\s+(?:di\s+|d['’]\s*)?(.+?)(?:\s+-\s+Procedura\b.*)?$/i);
  let trib = m ? m[1] : '';
  trib = trib.replace(/\s+-\s+(ex|sd)\b.*$/i, '').replace(/\s*\(.*\)\s*$/, '').trim(); // "Alessandria - ex Tortona" → Alessandria
  if (/^(camera di commercio|estero)$/i.test(trib)) trib = '';
  return { tribunale: trib, rge: proc.replace(/[.\-/]+$/, '') };
}

// Provincia (sigla tra parentesi) e, solo con formule esplicite, comune citati nel testo:
// "sito in Cutrofiano (LE)", "ubicato a Deruta (PG)", "nel Comune di Isola del Giglio (GR)".
export function luogoDaTesto(s) {
  const t = String(s || '');
  let sigla = '';
  for (const [, x] of t.matchAll(/\(([A-Z]{2})\)/g)) {
    if (provincia(x)) { sigla = x; break; }
  }
  let comune = '';
  const m = t.match(/\b(?:comune di|sit[oaie] in|ubicat[oaie] (?:a|in)|situat[oaie] (?:a|in))\s+([^,;:()\d]{2,40}?)\s*\(([A-Z]{2})\)/i);
  if (m && provincia(m[2])) {
    const c = m[1].replace(/^(localit[àa]|loc\.|frazione|fraz\.)\s*/i, '').trim();
    if (c.split(/\s+/).length <= 5) { comune = maiuscole(c); sigla = m[2]; }
  }
  return { sigla, comune };
}

// Toglie "Lotto: ", "LOTTO UNICO – ", "Bene N° 1 - " all'inizio del titolo.
export function pulisciTitolo(s) {
  let t = testo(s).replace(/^(bene|lotto)\s*(n\.?|nr\.?|n°|numero)?\s*(\d[\w./-]*|unico)?\s*[-–:.)]\s*/i, '');
  if (t.length > 110) t = t.slice(0, 110).replace(/\s+\S*$/, '') + '…';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Una pagina di ricerca → schede grezze (solo i dati mostrati nell'elenco).
export function estraiSchede(html) {
  const schede = [];
  for (const [, attr, corpo] of String(html || '').matchAll(/<article\b([^>]*\bdata-auction-id="\d+"[^>]*)>([\s\S]*?)<\/article>/g)) {
    const at = (nome) => decodifica((attr.match(new RegExp('\\b' + nome + '="([^"]*)"')) || [])[1] || '').trim();
    const prezzo = decodifica((corpo.match(/class="price-block"[^>]*?\btitle="([^"]*)"/) || [])[1] || '');
    const blocco = corpo.slice(Math.max(0, corpo.indexOf('name_type')));
    const paragrafi = [...blocco.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)].map(([, a, t]) => ({ conTitolo: /\btitle=/.test(a), testo: testo(t) }));
    const descr = (blocco.match(/class="visible-md-block[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
    const url = at('data-auction-url') || decodifica((blocco.match(/<a\s[^>]*href="([^"]+)"/) || [])[1] || '');
    schede.push({
      id: at('data-auction-id'),
      url,
      inizio: at('data-auction-data-inizio'),
      termine: at('data-auction-data-termine'),
      avviso: /\bis-avviso\b/.test(at('class')),
      etichettaPrezzo: prezzo.replace(/\s*€?\s*:.*$/, '').trim(),
      prezzo: (prezzo.match(/:\s*([\d.,]+)/) || [])[1] || '',
      titolo: decodifica((blocco.match(/<a\s[^>]*\btitle="([^"]*)"/) || [])[1] || '') || testo((blocco.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1]),
      modalita: (paragrafi.find((p) => p.conTitolo) || {}).testo || '',
      tribunale: (paragrafi.find((p) => /^(Tribunale|Procedura)\b/i.test(p.testo)) || {}).testo || '',
      testo: testo(descr.replace(/<\/li>/g, '; </li>')).replace(/;(\s*;)+/g, ';').replace(/;\s*$/, ''),
      presso: testo((corpo.match(/In vendita presso:\s*<\/span>\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1])
    });
  }
  return schede;
}

// Numero di risultati della ricerca (null se non indicato).
export function totaleRisultati(html) {
  const m = String(html || '').match(/total_elements:\s*(\d+)/) || String(html || '').match(/<strong>(\d+)<\/strong>\s*Risultati/);
  return m ? Number(m[1]) : null;
}

export function urlRicerca(filtro, pagina, verso = 'desc') {
  return `${BASE}/ricerca.html?filter=${encodeURIComponent(filtro)}&order=termine&verso=${verso}&page=${pagina}`;
}

const pag = (n) => `${n} ${n === 1 ? 'pagina' : 'pagine'}`;
const taglia = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

// Scheda grezza → asta (null se la vendita non ha una data dal giorno "oggi" in poi).
export function converti(x, sez, oggi) {
  const ini = dataOra(x.inizio), fin = dataOra(x.termine);
  const quando = ini && ini.data >= oggi ? ini : fin && fin.data >= oggi ? fin : null;
  if (!quando || !x.id) return null;
  const inCorso = quando === fin && ini && ini.data < oggi; // gara telematica già aperta

  const { tribunale, rge } = tribunaleProcedura(x.tribunale);
  const giudiziaria = !!tribunale;
  const luogo = luogoDaTesto(x.titolo + ' ' + x.testo);
  const p = (luogo.sigla && provincia(luogo.sigla)) || provincia(tribunale);

  let titolo = pulisciTitolo(x.titolo);
  if (titolo.length < 8) titolo = pulisciTitolo(x.testo) || sez.tipo;
  const { categoria, genere } = categoriaVeicolo(sez, x.titolo, x.testo);

  const modalita = x.avviso ? 'avviso di vendita' : x.modalita.toLowerCase();
  const tipo = [genere, modalita, giudiziaria ? '' : 'vendita non giudiziaria'].filter(Boolean).join(' · ');

  const base = /prezzo base/i.test(x.etichettaPrezzo) ? numero(x.prezzo) : null;
  const note = [
    x.avviso ? 'Solo avviso pubblicitario su Fallco Aste.' : '',
    giudiziaria ? '' : 'Vendita non giudiziaria (nessun tribunale indicato).',
    inCorso ? `Gara in corso dal ${ini.gma} al ${fin.gma} ore ${fin.ora}.` : '',
    !inCorso && fin && quando === ini && fin.data > ini.data ? `Termine gara ${fin.gma} ore ${fin.ora}.` : '',
    /miglior offerta/i.test(x.etichettaPrezzo) && x.prezzo ? `Miglior offerta alla raccolta: € ${x.prezzo}.` : '',
    x.presso ? `Presso ${x.presso.replace(/\.+$/, '')}.` : '',
    x.testo && x.testo !== x.titolo ? x.testo : ''
  ].filter(Boolean).join(' ');

  const link = /^https?:\/\//.test(x.url) ? x.url : x.url ? BASE + '/' + x.url.replace(/^\/+/, '') : '';
  return {
    id: 'fallco-' + x.id,
    titolo,
    categoria,
    tipo,
    regione: p ? p.regione : '',
    provincia: p ? p.sigla : '',
    comune: luogo.comune,
    indirizzo: '',
    tribunale: tribunale ? maiuscole(tribunale) : '',
    rge,
    fonte: NOME,
    prezzoBase: base && base > 0 ? base : null,
    offertaMinima: null,
    dataAsta: quando.data,
    ora: quando.ora,
    stato: 'nd',
    linkAvviso: link,
    linkPerizia: '',
    linkPdf: '',
    lat: null,
    lng: null,
    descrizione: taglia(note, 200)
  };
}

/* ---- raccolta ---- */

// maxPagine: pagine massime per ciascuna sezione (per le prove veloci).
export async function raccogli({ oggi, maxPagine = Infinity, log = console.log }) {
  const aste = []; const visti = new Set();
  const resoconto = []; const tagli = [];
  let richieste = 0;

  for (const sez of SEZIONI) {
    const verso = sez.residua ? 'asc' : 'desc'; // dal termine più lontano: le vendite che chiudono durante la lettura escono in fondo e non spostano le pagine
    const vistiSezione = new Set();
    let pagine = null, lette = 0, nuove = 0, scartate = 0, totale = null, taglio = '';

    for (let pagina = 1; pagine === null || pagina <= pagine; pagina++) {
      if (pagina > maxPagine) { taglio = `limite di prova di ${pag(maxPagine)}`; break; }
      if (richieste >= MAX_RICHIESTE) { taglio = `limite di ${MAX_RICHIESTE} richieste al giorno`; break; }
      const h = await richiesta(urlRicerca(sez.filtro, pagina, verso), { intervalloMs: INTERVALLO_MS });
      richieste++; lette++;
      const schede = estraiSchede(h);
      if (totale === null) {
        totale = totaleRisultati(h);
        if (totale === null && schede.length) throw new Error(`pagina di ricerca senza numero di risultati (${sez.nome}): struttura del sito cambiata?`);
        pagine = Math.ceil((totale || 0) / PER_PAGINA);
      }
      if (!schede.length) break;
      let diverse = 0;
      for (const x of schede) {
        if (vistiSezione.has(x.id)) continue;
        vistiSezione.add(x.id); diverse++;
        if (visti.has(x.id)) continue;
        const a = converti(x, sez, oggi);
        if (!a) { scartate++; continue; }
        visti.add(x.id); aste.push(a); nuove++;
      }
      if (!diverse) { log(`  Fallco ${sez.nome}: la pagina ${pagina} ripete la precedente, lettura della sezione fermata`); break; }
      if (lette % 25 === 0) log(`  Fallco ${sez.nome} pagina ${pagina}/${pagine}: ${aste.length} aste finora`);
    }

    if (taglio) {
      tagli.push(`${sez.nome}: lette ${pag(lette)} su ${pagine} (${taglio}${sez.residua ? ', prima le vendite che scadono prima' : ''})`);
      log(`  Fallco ${sez.nome}: lette solo ${pag(lette)} su ${pagine} per il ${taglio}; circa ${Math.max(0, (totale || 0) - lette * PER_PAGINA)} vendite non lette`);
    }
    resoconto.push(`${sez.nome} ${nuove}`);
    log(`  Fallco ${sez.nome}: ${nuove} aste nuove (${totale ?? 0} in elenco, ${scartate} senza data futura)`);
  }

  log(`  Fallco: ${aste.length} aste con ${pag(richieste)} di elenco`);
  const nota = `${aste.length} vendite con data dal ${oggi} (${resoconto.join(', ')}), lette dall'elenco pubblico senza aprire le schede.` +
    (tagli.length ? ` Lettura parziale: ${tagli.join('; ')}.` : '');
  return { aste, nota };
}
