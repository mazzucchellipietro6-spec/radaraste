// Portale delle Vendite Pubbliche (Ministero della Giustizia).
// Usa lo stesso servizio JSON pubblico che il portale interroga per mostrare gli annunci
// ai visitatori (nessun login, nessun captcha sulla ricerca). Le vendite sono ordinate per
// data decrescente e la lettura si ferma alla prima asta già passata.
import { richiesta } from '../lib/http.mjs';
import { provincia, titolo as maiuscole } from '../lib/luoghi.mjs';

export const NOME = 'Portale Vendite Pubbliche';
const RICERCA = 'https://pvp.giustizia.it/ric-496b258c-986a1b71/ric-ms/ricerca/vendite';
const AVVISO = 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=';
const DIMENSIONE_PAGINA = 100;
const INTERVALLO_MS = 2500;      // una richiesta ogni 2,5 secondi
const ANNI_MAX_FUTURO = 3;       // date oltre questo orizzonte sono errori di inserimento

function categoria(x) {
  if (x.tipoLotto === 'IMMOBILI') return 'immobile';
  if (x.categoriaLotto === 'AUTOVEICOLI_E_CICLI') {
    return (x.categoriaBene || []).some((b) => /MOTOVEICOLO|CICLOMOTORE/.test(b)) ? 'moto' : 'auto';
  }
  return 'beni';
}

function stato(disp) {
  const d = disp || [];
  if (d.some((v) => /^OCC|^INCOR/.test(v))) return 'occupato';
  if (d.length && d.every((v) => v === 'LIBER')) return 'libero';
  return 'nd';
}

const tipo = (s) => s ? (s.charAt(0) + s.slice(1).toLowerCase()).replace(/_/g, ' ') : '';

function titolo(x, comune) {
  let t = String(x.descLotto || '').replace(/\s+/g, ' ').trim()
    .replace(/^(bene|lotto)\s*(n\.?|nr\.?|numero)?\s*[\w./-]*\s*[-–:.]?\s*/i, '');
  if (t.length > 110) t = t.slice(0, 110).replace(/\s+\S*$/, '') + '…';
  if (t.length < 8) t = tipo(x.categoriaLotto) + (comune ? ' – ' + comune : '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function converti(x) {
  const ind = x.indirizzo || {};
  const trib = String(x.tribunale || '').replace(/^tribunale\s+(ordinario\s+)?d[ie]\s+/i, '');
  const p = provincia(ind.provincia) || provincia(trib);
  const comune = ind.citta ? maiuscole(ind.citta) : '';
  const c = ind.coordinate;
  return {
    id: 'pvp-' + x.id,
    titolo: titolo(x, comune),
    categoria: categoria(x),
    tipo: tipo(x.categoriaLotto),
    regione: p ? p.regione : '',
    provincia: p ? p.sigla : '',
    comune,
    indirizzo: String(ind.via || '').replace(/\s+/g, ' ').trim().slice(0, 90),
    tribunale: trib ? maiuscole(trib) : '',
    rge: x.procedura ? String(x.procedura) : '',
    fonte: NOME,
    prezzoBase: x.prezzoBaseAsta ?? null,
    offertaMinima: x.offertaMinima ?? null,
    dataAsta: x.dataVendita || '',
    ora: x.orarioVendita || '',
    stato: stato(x.disponibilita),
    linkAvviso: AVVISO + x.id,
    lat: c && isFinite(c.latitudine) ? Math.round(c.latitudine * 1e5) / 1e5 : null,
    lng: c && isFinite(c.longitudine) ? Math.round(c.longitudine * 1e5) / 1e5 : null
  };
}

export async function raccogli({ oggi, maxPagine = Infinity, log = console.log }) {
  const limite = new Date(oggi); limite.setFullYear(limite.getFullYear() + ANNI_MAX_FUTURO);
  const fine = limite.toISOString().slice(0, 10);
  const aste = []; const visti = new Set();
  let scartateData = 0, totale = null;

  for (let pagina = 0; pagina < maxPagine; pagina++) {
    const url = `${RICERCA}?language=it&page=${pagina}&size=${DIMENSIONE_PAGINA}&sort=dataVendita,desc&sort=orarioVendita,desc`;
    const r = await richiesta(url, { metodo: 'POST', corpo: '{}', intestazioni: { 'Content-Type': 'application/json', Accept: 'application/json' }, json: true, intervalloMs: INTERVALLO_MS });
    const b = r && r.body;
    if (!b || !Array.isArray(b.content)) throw new Error('risposta inattesa dal PVP: ' + JSON.stringify(r).slice(0, 200));
    if (totale === null) totale = b.totalElements;
    let passate = false;
    for (const x of b.content) {
      if (!x.dataVendita) continue;
      if (x.dataVendita < oggi) { passate = true; break; }
      if (x.dataVendita > fine) { scartateData++; continue; }
      if (visti.has(x.id)) continue;
      visti.add(x.id);
      aste.push(converti(x));
    }
    if (pagina % 20 === 0) log(`  PVP pagina ${pagina + 1}: ${aste.length} aste future finora`);
    if (passate || b.last) break;
  }
  log(`  PVP: ${aste.length} aste future (scartate ${scartateData} con data oltre il ${fine})`);
  return { aste, nota: `${aste.length} aste con data dal ${oggi}; ${scartateData} scartate per data palesemente errata.` };
}
