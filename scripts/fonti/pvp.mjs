// Portale delle Vendite Pubbliche (Ministero della Giustizia).
// Usa lo stesso servizio JSON pubblico che il portale interroga per mostrare gli annunci
// ai visitatori (nessun login, nessun captcha sulla ricerca). Le vendite sono ordinate per
// data decrescente e la lettura si ferma alla prima asta già passata.
import { richiesta } from '../lib/http.mjs';
import { provincia, titolo as maiuscole } from '../lib/luoghi.mjs';
import { pulisci, spazi, segnaposto } from '../lib/dettaglio-pvp.mjs';
import { controllaCoordinate, soloBiciclette, prezzo, togliPrefisso, frase } from '../lib/correzioni.mjs';

export const NOME = 'Portale Vendite Pubbliche';
const RICERCA = 'https://pvp.giustizia.it/ric-496b258c-986a1b71/ric-ms/ricerca/vendite';
const AVVISO = 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=';
const DIMENSIONE_PAGINA = 1000;  // il servizio accetta fino a 1000 vendite per pagina
const INTERVALLO_MS = 2500;      // una richiesta ogni 2,5 secondi
const ANNI_MAX_FUTURO = 3;       // date oltre questo orizzonte sono errori di inserimento

export function categoria(x) {
  if (x.tipoLotto === 'IMMOBILI') return 'immobile';
  if (x.categoriaLotto === 'AUTOVEICOLI_E_CICLI') {
    if ((x.categoriaBene || []).some((b) => /MOTOVEICOLO|CICLOMOTORE/.test(b))) return 'moto';
    // lotti di sole biciclette (anche elettriche): sono beni, non auto
    return soloBiciclette(x) ? 'beni' : 'auto';
  }
  return 'beni';
}

function stato(disp) {
  const d = disp || [];
  if (d.some((v) => /^OCC|^INCOR/.test(v))) return 'occupato';
  if (d.length && d.every((v) => v === 'LIBER')) return 'libero';
  return 'nd';
}

// "ALTRA_CATEGORIA_M" → "Altra categoria m": le etichette abbreviate dalla fonte restano come sono (nessun completamento)
export const tipo = (s) => s ? (s.charAt(0) + s.slice(1).toLowerCase()).replace(/_/g, ' ') : '';

// entità HTML, anche codificate due volte dalla fonte: "&amp;quot;Serpentara&amp;quot;" (pvp-4641380) → "\"Serpentara\""
const ENTITA = { amp: '&', quot: '"', apos: '\'', lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»',
  deg: '°', euro: '€', agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù' };
export function entita(t) {
  let s = String(t || '');
  for (let i = 0; i < 3 && /&amp;/.test(s); i++) s = s.replace(/&amp;/g, '&');
  return s.replace(/&(#\d{1,7}|#x[\da-f]{1,6}|[a-z]{2,6});/gi, (m, e) => {
    if (e[0] !== '#') return ENTITA[e] ?? m;
    const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 31 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
  });
}

// segni iniziali senza senso: "• ", "-", "► ", "_", "° " (resto di "LOTTO 7° costituito", pvp-4618989), "/D: " (resto di "Lotto 4/D:"),
// simboli di caratteri speciali (U+E000-U+F8FF); restano parentesi, virgolette, "½" e "+", che possono essere testo vero
const SEGNI = /^[\s\u2022\u2023\u25aa\u25ba\u25cf\u27a2\u00b7°º*=_.,;:\-–—\/\ue000-\uf8ff]+/;
export const segniIniziali = (t) => String(t || '').replace(/^\s*\/[A-Za-z\d]{1,3}\s*[:.)–-]\s*/, '').replace(SEGNI, '');

// "(Lotto n.1) - APPARTAMENTO SITO IN ..." → "Appartamento sito in ...", al massimo 110 caratteri
// (la descrizione completa è nella scheda a pezzi); senza descrizione vera ("Lotto 1", "NESSUNA"): categoria e comune
export function titolo(x, comune, sigla) {
  let t = spazi(frase(segniIniziali(togliPrefisso(segniIniziali(pulisci(entita(x.descLotto))))), { comune, provincia: sigla })).trim();
  if (t.length > 110) t = t.slice(0, 110).replace(/\s+\S*$/, '').replace(/[\s,;:–-]+$/, '') + '…';
  if (t.replace(/[^A-Za-zÀ-ÿ]/g, '').length < 6 || segnaposto(t)) t = tipo(x.categoriaLotto) + (comune ? ' – ' + comune : '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// "LOTTO 001" → "1", "Lotto unico" → "Unico", "3 bis" → "3 bis"
export function numeroLotto(s) {
  let t = String(s ?? '').replace(/\s+/g, ' ').trim().replace(/^lott[oi]\s*(?:n(?:r|um(?:ero)?)?\s*[.°º]?\s*)?/i, '');
  if (/^\d+$/.test(t)) t = String(parseInt(t, 10));
  if (/^unico$/i.test(t)) t = 'Unico';
  return t ? t.slice(0, 20) : null;
}

export function converti(x, stat = null) {
  const ind = x.indirizzo || {};
  const trib = String(x.tribunale || '').replace(/^tribunale\s+(ordinario\s+)?d[ie]\s+/i, '');
  const p = provincia(ind.provincia) || provincia(trib);
  const comune = ind.citta ? maiuscole(ind.citta) : '';
  const c = ind.coordinate || {};
  const coord = controllaCoordinate(c.latitudine, c.longitudine, p && p.sigla);
  const cat = categoria(x);
  if (stat) {
    if (coord.scarto) stat.coordinateScartate[coord.scarto] = (stat.coordinateScartate[coord.scarto] || 0) + 1;
    if (cat === 'beni' && x.categoriaLotto === 'AUTOVEICOLI_E_CICLI') stat.biciclette++;
    if (x.prezzoBaseAsta === 0) stat.prezzoZero++;
    if (x.offertaMinima === 0) stat.offertaZero++;
  }
  return {
    id: 'pvp-' + x.id,
    titolo: titolo(x, comune, p && p.sigla),
    categoria: cat,
    tipo: tipo(x.categoriaLotto),
    regione: p ? p.regione : '',
    provincia: p ? p.sigla : '',
    comune,
    indirizzo: String(ind.via || '').replace(/\s+/g, ' ').trim().slice(0, 90),
    tribunale: trib ? maiuscole(trib) : '',
    rge: x.procedura ? String(x.procedura) : '',
    fonte: NOME,
    prezzoBase: prezzo(x.prezzoBaseAsta),
    offertaMinima: prezzo(x.offertaMinima),
    dataAsta: x.dataVendita || '',
    pubblicata: x.dataPubblicazione || '',
    ora: x.orarioVendita || '',
    stato: stato(x.disponibilita),
    linkAvviso: AVVISO + x.id,
    lat: coord.lat,
    lng: coord.lng,
    numeroLotto: numeroLotto(x.numeroLotto),
    rialzo: prezzo(x.rialzoMinimo),
    // dati grezzi per l'arricchimento (storico dei tentativi, descrizione completa): non vanno nel file pubblicato
    _pvp: {
      id: x.id, codiceTribunale: x.codiceTribunale, procedura: x.procedura, numeroLotto: x.numeroLotto, dataVendita: x.dataVendita,
      prezzoBaseAsta: x.prezzoBaseAsta, esito: x.esito || null, indirizzo: { citta: ind.citta, via: ind.via },
      tipoLotto: x.tipoLotto, categoriaLotto: x.categoriaLotto, descLotto: x.descLotto, rialzoMinimo: x.rialzoMinimo
    }
  };
}

export async function raccogli({ oggi, maxPagine = Infinity, log = console.log }) {
  const limite = new Date(oggi); limite.setFullYear(limite.getFullYear() + ANNI_MAX_FUTURO);
  const fine = limite.toISOString().slice(0, 10);
  const aste = []; const visti = new Set();
  let scartateData = 0, totale = null, richieste = 0, futureViste = 0;
  const correzioni = { coordinateScartate: {}, biciclette: 0, prezzoZero: 0, offertaZero: 0 };

  for (let pagina = 0; pagina < maxPagine; pagina++) {
    // l'ordinamento finale per id rende stabili le pagine (molte vendite hanno stessa data e ora)
    const url = `${RICERCA}?language=it&page=${pagina}&size=${DIMENSIONE_PAGINA}&sort=dataVendita,desc&sort=orarioVendita,desc&sort=id,desc`;
    const r = await richiesta(url, { metodo: 'POST', corpo: '{}', intestazioni: { 'Content-Type': 'application/json', Accept: 'application/json' }, json: true, intervalloMs: INTERVALLO_MS });
    const b = r && r.body;
    if (!b || !Array.isArray(b.content)) throw new Error('risposta inattesa dal PVP: ' + JSON.stringify(r).slice(0, 200));
    if (totale === null) totale = b.totalElements;
    let passate = false;
    for (const x of b.content) {
      if (!x.dataVendita) continue;
      if (x.dataVendita < oggi) { passate = true; break; }
      futureViste++;
      if (x.dataVendita > fine) { scartateData++; continue; }
      if (visti.has(x.id)) continue;
      visti.add(x.id);
      aste.push(converti(x, correzioni));
    }
    if (pagina % 5 === 0) log(`  PVP pagina ${pagina + 1}: ${aste.length} aste future finora`);
    richieste++;
    if (passate || b.last) break;
  }
  log(`  PVP: ${aste.length} aste future (scartate ${scartateData} con data oltre il ${fine}; ${richieste} richieste)`);
  const sc = correzioni.coordinateScartate;
  log(`  PVP correzioni: ${(sc['fuori-italia'] || 0) + (sc.lontana || 0)} coordinate scartate (${sc['fuori-italia'] || 0} fuori dall'Italia, ${sc.lontana || 0} a oltre 150 km dalla provincia), ` +
    `${correzioni.biciclette} lotti di biciclette spostati tra i beni, ${correzioni.prezzoZero} prezzi base a zero e ${correzioni.offertaZero} offerte minime a zero trattati come mancanti`);
  // futureViste: vendite con data da oggi in poi nella ricerca (anche quelle scartate): serve all'indice storico per partire dalla pagina giusta
  return { aste, richieste, futureViste, correzioni, nota: `${aste.length} aste con data dal ${oggi}; ${scartateData} scartate per data palesemente errata.` };
}
