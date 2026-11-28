// Dettaglio pubblico di una vendita del Portale Vendite Pubbliche (GET .../vendite/{id}/restricted, senza login).
// Si leggono solo i campi che servono alla scheda; i dati personali (soggetti, codici fiscali, nomi, telefoni,
// email/PEC) non vengono mai salvati e si tolgono anche dai testi descrittivi.
// Le funzioni di estrazione sono pure (tests/dettaglio.test.mjs); scarica() usa la rete, una richiesta ogni 3 s.
import { richiesta, FonteBloccata } from './http.mjs';

export const DETTAGLIO = 'https://pvp.giustizia.it/ve-3f723b85-986a1b71/ve-ms/vendite/';
export const RISORSE = 'https://resource-pvp.giustizia.it';
const INTERVALLO_MS = 3000;
export const MAX_FOTO = 8;
export const MAX_DESCRIZIONE = 1500;

export const urlDettaglio = (id) => `${DETTAGLIO}${encodeURIComponent(id)}/restricted?language=it`;

/* ---------- testi: pulizia dei dati personali ---------- */

// rende "maiuscole/minuscole indifferenti" solo una parte del pattern (il nome che segue resta con l'iniziale maiuscola)
const ci = (src) => src.replace(/\[[^\]]*\]|\\.|[a-z]| /g, (x) => (x === ' ' ? '\\s+' : x[0] === '[' ? x.slice(0, -1) + x.slice(1, -1).toUpperCase() + ']' : x[0] === '\\' ? x : '[' + x + x.toUpperCase() + ']'));
// anche senza il punto ("l'avv Rossi", "CTU Ing Bianchi": "(?![a-z])" = l'abbreviazione finisce lì)
const TITOLI = ci("(?:sig(?:\\.ra|\\.na|nora|nore|nor|\\.|(?![a-z]))|signor[ae]?|dott(?:\\.ssa|oressa|ore|\\.|(?![a-z]))|dr\\.|avv(?:\\.to|ocat[oa]|\\.|(?![a-z]))|geom(?:etra|\\.|(?![a-z]))|arch(?:itetto|\\.)|ing(?:egnere|\\.|(?![a-z]))|rag(?:ioniere|\\.)|notai[oa]|prof(?:essore|\\.ssa|\\.|(?![a-z]))|p\\. ?i\\.|per\\. ?ind\\.|perito ind(?:ustriale|\\.))");
// parole con l'iniziale maiuscola che, dopo un titolo o un ruolo, NON sono nomi di persona
const NON_NOMI_SRC = "avv|avvocat[oa]|dott|dottor\\w*|dr|geom|geometra|arch|architetto|ing|ingegnere|rag|ragioniere|sig|signor\\w*|notai[oa]|prof|professor\\w*|p|per|giudiziari[oa]|nominat[oa]|incaricat[oa]|alla|della|del|dell|delegat[oa]|vendita|tribunale|istituto|ivg|ufficio|il|la|lo|sede|presso|competente|fallimentare|liquidazione|procedura|esecutat[oai]|esecuzione|occupante|occupato|in|che|come|ed|e|con|dal|dalla|soc\\w*|s\\.?r\\.?l|s\\.?p\\.?a";
const NON_NOMI = new RegExp('^(?:' + NON_NOMI_SRC + ')$', 'i');
const nomeVero = (nome) => {
  const w = String(nome).split(/\s+/);
  const primo = w.length > 1 && PARTICELLA_RE.test(w[0]) ? w[1] : w[0];
  return !NON_NOMI.test(primo.replace(/[.,;:]+$/, ''));
};
// una parola del nome non può essere un titolo o un ruolo: così "Notaio incaricato Dott. Mario Rossi" e
// "Dott. Ing. Mario Rossi" non "consumano" il titolo che precede il nome vero
const NON_NOME = '(?!(?:' + ci(NON_NOMI_SRC) + ")(?![A-Za-zÀ-ÿ'’]))";
// nome: da 1 a 3 parole con l'iniziale maiuscola, anche iniziali puntate ("M.")
const PAROLA = NON_NOME + "[A-ZÀ-Ý][A-Za-zÀ-ÿ'’]+", PAROLA_MAIUSCOLA = NON_NOME + "[A-ZÀ-Ý][A-ZÀ-Ý'’]+", INIZIALE = '[A-Z]\\.';
// cognomi con particella: "Sig. Lo Re", "Avv. De Luca", "dott.ssa Della Valle" (la particella conta solo se segue un'altra parola)
const PARTICELLA = "(?:D[aeio]|De[il]|Dell[aeo]?|Dal(?:la)?|L[aeio]|DA|DE|DI|DEL|DELL[AEO]?|DAL(?:LA)?|L[AEIO])";
const PARTICELLA_RE = new RegExp('^' + PARTICELLA + '$');
const nome = (p) => `(?:${PARTICELLA}\\s+(?=[A-ZÀ-Ý]))?(?:${p}|${INIZIALE})(?:\\s+(?:${p}|${INIZIALE})){0,2}`;
const NOME = nome(PAROLA), NOME_MAIUSCOLO = nome(PAROLA_MAIUSCOLA);
const RE_TITOLO = new RegExp('\\b(' + TITOLI + ')\\s*(' + NOME + ')', 'g');
// ruoli seguiti dal nome di una persona (o di una ditta: si toglie lo stesso)
const RUOLI_FORTI = ci('(?:intestat[oaie] a|a nome d[ie]l?|in capo a)');
const RUOLI = ci('(?:custode(?: giudiziari[oa])?|professionista delegat[oa]|delegat[oa](?: alla vendita)?|curatore(?: fallimentare)?|liquidatore(?: giudiziale)?|perito|stimatore|c\\.?t\\.?u\\.?|esecutat[oaie]|debitor[ei](?: esecutat[oi])?|fallit[oa])');
const RE_RUOLO = new RegExp('\\b(' + RUOLI_FORTI + '|' + RUOLI + ')\\s*:?\\s+(' + NOME + ')', 'g');
const RE_RUOLO_FORTE_MAIUSCOLO = new RegExp('\\b(' + RUOLI_FORTI + ')\\s*:?\\s+(' + NOME_MAIUSCOLO + ')', 'g');
const RE_TITOLO_MAIUSCOLO = new RegExp('\\b(' + TITOLI + ')\\s*(' + NOME_MAIUSCOLO + ')', 'g');
const RE_EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const RE_CF = /\b[A-Z]{6}\s?\d{2}\s?[A-Z]\s?\d{2}\s?[A-Z]\s?\d{3}\s?[A-Z]\b/gi;
const RE_PIVA = /\b((?:p\.?\s?iva|partita\s+iva|c\.?\s?f\.?|cod(?:ice|\.)\s+fiscale)(?:\s*(?:e|\/)\s*(?:p\.?\s?iva|partita\s+iva))?\s*[:n.°]*\s*)\d{11}\b/gi;
const RE_CELL = /(?:\+39[\s.]?)?\b3\d{2}[\s./-]?\d{3}[\s./-]?\d{3,4}\b/g;
const RE_IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/g;
const RE_FISSO = /\b(?:tel\w*|telefon\w*|cell\w*|mob\w*|fax|recapit\w*|contatt\w*|chiamare|whatsapp|n\.\s?verde)\.?\s*:?\s*(?:\+39[\s.]?)?\(?0\d{1,4}\)?[\s./-]?\d{2,4}[\s./-]?\d{2,4}(?:[\s./-]?\d{2,4})?/gi;

const OMISSIS = '[omissis]';
const MESI = '(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)';
const RE_NASCITA = new RegExp("\\b(nat[oaie])\\s+(?:a\\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’]+(?:\\s+[A-ZÀ-Ýa-zà-ÿ'’]+){0,3}?\\s*(?:\\([A-Z]{2}\\))?\\s*,?\\s*)?(?:il|in data)\\s+\\d{1,2}(?:\\s*[./-]\\s*\\d{1,2}\\s*[./-]\\s*\\d{2,4}|°?\\s+" + MESI + "\\s+\\d{4})", 'gi');
const STRADA_PRIMA = /\b(?:via|viale|v\.le|piazza|p\.zza|piazzale|corso|c\.so|largo|vicolo|vico|contrada|c\.da|strada|lungomare|lungotevere|salita|traversa|rione|borgo|galleria)\s*$/i;

export function pulisci(testo) {
  let t = String(testo || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
  t = t.replace(RE_EMAIL, OMISSIS);
  t = t.replace(RE_IBAN, (m) => (/\d{6}/.test(m.replace(/\s/g, '')) ? OMISSIS : m));
  t = t.replace(RE_CF, OMISSIS).replace(RE_PIVA, '$1' + OMISSIS);
  t = t.replace(RE_NASCITA, '$1 ' + OMISSIS);
  t = t.replace(RE_FISSO, (m) => m.replace(/\(?\+?\d[\d\s./()-]{5,}$/, ' ' + OMISSIS));
  t = t.replace(RE_CELL, (m, i, tutto) => (/(?:€|euro|eur\.?)\s*$/i.test(tutto.slice(Math.max(0, i - 6), i)) ? m : OMISSIS));
  // titolo + nome: "dott. Mario Rossi" → "dott. [omissis]"; nei testi tutti maiuscoli anche "AVV. MARIO ROSSI"
  const maiuscolo = t.replace(/[^A-Za-zÀ-ÿ]/g, '').length > 20 && t === t.toUpperCase();
  // il nome di una strada ("via Dott. Giuseppe Mazzini", "piazza Avv. ...") resta: è un indirizzo, non una persona coinvolta
  const sostituisci = (m, ruolo, nome, i, tutto) => (nomeVero(nome) && !STRADA_PRIMA.test(tutto.slice(Math.max(0, i - 25), i))
    ? m.slice(0, m.length - nome.length) + OMISSIS : m);
  if (maiuscolo) t = t.replace(RE_TITOLO_MAIUSCOLO, sostituisci).replace(RE_RUOLO_FORTE_MAIUSCOLO, sostituisci);
  else t = t.replace(RE_TITOLO, sostituisci).replace(RE_RUOLO, sostituisci);
  // "[omissis] e Anna Bianchi" → "[omissis]"
  const p = maiuscolo ? PAROLA_MAIUSCOLA : PAROLA;
  const altro = new RegExp(`\\[omissis\\](\\s+(?:e|ed|E|ED)\\s+)(${p}(?:\\s+${p}){0,2})`, 'g');
  for (let i = 0; i < 3; i++) t = t.replace(altro, (m, sep, nome) => (nomeVero(nome) ? OMISSIS : m));
  return t.replace(/(?:\[omissis\][\s,;-]*){2,}/g, OMISSIS + ' ').replace(/\s+/g, ' ').trim();
}

export function taglia(t, max) {
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9à-ÿ]/g, '');

// spazio mancante dopo il punto tra due frasi ("piano S2.Trattasi di", "Frosinone.Identificato"): le sigle
// ("S.p.A.", "Fg.19", "mq.208") restano come sono
export const spazi = (t) => String(t || '').replace(/([A-Za-zÀ-ÿ\d][a-zà-ÿ\d])\.([A-ZÀ-Ý][a-zà-ÿ]{2})/g, '$1. $2');

// parola messa dalla fonte al posto della descrizione: "NESSUNA" (pvp-4649172, 21/10/2026, nel lotto e nel bene)
export const segnaposto = (t) => /^\s*nessun[ao]?\s*\.?\s*$/i.test(String(t || ''));

// descLotto + descrizioni dei beni, senza ripetizioni, ripulite, al massimo 1500 caratteri
export function descrizione(descLotto, beni = []) {
  const parti = [];
  const visti = [];
  for (const p of [descLotto, ...beni.map((b) => b && b.descrizione)]) {
    const t = String(p || '').replace(/\s+/g, ' ').trim();
    const n = norm(t);
    if (n.length < 3 || segnaposto(t)) continue;
    // salta i testi già contenuti in uno precedente; se un testo contiene uno precedente, lo sostituisce
    if (visti.some((v) => v.includes(n))) continue;
    const i = visti.findIndex((v) => n.includes(v));
    if (i >= 0) { visti[i] = n; parti[i] = t; continue; }
    visti.push(n); parti.push(t);
  }
  if (!parti.length) return null;
  return taglia(spazi(pulisci(parti.map((t) => /[.!?…]$/.test(t) ? t : t + '.').join(' '))), MAX_DESCRIZIONE);
}

/* ---------- campi del dettaglio ---------- */

// "/allegati/1/AVV 1°ASTA.pdf?versionId=x" → URL completo con il percorso codificato
export function urlRisorsa(link) {
  if (!link || typeof link !== 'string') return null;
  const [percorso, ...query] = link.split('?');
  const p = percorso.split('/').map((s) => { try { return encodeURIComponent(decodeURIComponent(s)); } catch { return encodeURIComponent(s); } }).join('/');
  return RISORSE + (p.startsWith('/') ? '' : '/') + p + (query.length ? '?' + query.join('?').replace(/[^\w.~=&%-]/g, encodeURIComponent) : '');
}

const dataIso = (d) => { const m = String(d || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
const ora = (o) => { const m = String(o || '').match(/^(\d{1,2})[:.](\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null; };

export function termine(data, orario) {
  const d = dataIso(data);
  if (!d) return null;
  const o = ora(orario);
  return o ? `${d}T${o}` : d;
}

// numero "chiaro" di metri quadrati: "185", "103,72", "1.250 mq"
export function mqChiari(s) {
  if (typeof s === 'number') return s >= 5 && s <= 50000 ? s : null;
  const m = String(s || '').trim().match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:mq|m2|m²|metri\s*quadr\w*)?\.?$/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/\./g, '') + (m[2] ? '.' + m[2] : ''));
  return v >= 5 && v <= 50000 ? v : null;
}

const ACCESSORIO = /box|garage|autorimess|cantin|posto auto|soffitt|magazzin|deposit|tettoi|corte|terren|area urbana/i;
function superficieBeni(beni) {
  const conMq = beni.map((b) => ({ b, mq: mqChiari(b.superficie) })).filter((x) => x.mq);
  if (!conMq.length) return null;
  const principale = conMq.find((x) => !ACCESSORIO.test(x.b.descTipologiaBene || ''));
  return (principale || conMq[0]).mq;
}

export function catasto(beni) {
  const out = [];
  for (const b of beni) {
    for (const c of b.datiCatastali || []) {
      const p = [];
      if (c.textSezione) p.push('Sez.' + String(c.textSezione).trim());
      if (c.textFoglio) p.push('F.' + String(c.textFoglio).trim());
      if (c.textParticella) p.push('P.' + String(c.textParticella).trim());
      if (c.textSubalterno) p.push('S.' + String(c.textSubalterno).trim());
      const s = p.join(' ');
      if (s && !out.includes(s)) out.push(s);
    }
  }
  if (!out.length) return null;
  return out.slice(0, 6).join(', ') + (out.length > 6 ? ` e altri ${out.length - 6}` : '');
}

// "10% del prezzo offerto" → { testo, perc: 10 }; "5000,00" → { testo: "5000,00", perc: null }
export function cauzione(s) {
  const t = pulisci(s).slice(0, 120);
  if (!t) return { testo: null, perc: null };
  const m = t.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*%/);
  const perc = m ? parseFloat(m[1].replace(',', '.')) : null;
  return { testo: t.length > 80 ? taglia(t, 80) : t, perc: perc > 0 && perc <= 100 ? perc : null };
}

const IMMAGINE = /\.(jpe?g|png|webp|gif)(\?|$)/i;
function foto(beni) {
  const out = [];
  for (const b of beni) {
    for (const a of b.allegati || []) {
      const link = a && a.linkAllegato;
      if (!link) continue;
      if (!(/IMMAGINE/i.test(a.descrizione || '') || /^\/?immagini-beni\//.test(link)) || !IMMAGINE.test(link) || !nomeFileSicuro(link)) continue;
      const u = urlRisorsa(link);
      if (u && !out.includes(u)) out.push(u);
    }
  }
  return out;
}

// nome del file senza dati personali riconoscibili (email, codici fiscali, telefoni, "avv. Nome Cognome"...)
export function nomeFileSicuro(link) {
  let nome = String(link || '').split('?')[0].split('/').pop();
  try { nome = decodeURIComponent(nome); } catch { /* resta com'è */ }
  nome = nome.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' ');
  return pulisci(nome) === nome.replace(/\s+/g, ' ').trim();
}

const REDATTA = /privacy|pivacy|epurat|oscurat|anonim|omissis|dati sens|versione pubblic/i;
function allegati(lista) {
  const L = (lista || []).filter((a) => a && a.linkAllegato && nomeFileSicuro(a.linkAllegato));
  const testo = (a) => (a.descrizione || '') + ' ' + (a.nomeFile || '');
  const perizie = L.filter((a) => a.codiceTipoAllegato === 'PERIZ');
  const perizia = perizie.find((a) => REDATTA.test(testo(a))) || perizie[0];
  const avviso = L.find((a) => a.codiceTipoAllegato === 'AVEND') || L.find((a) => /avviso/i.test(testo(a)) && a.codiceTipoAllegato !== 'PERIZ');
  const ordinanza = L.find((a) => a.codiceTipoAllegato === 'ORDIN' && a !== avviso) || L.find((a) => a.codiceTipoAllegato === 'PROVV' && /ordinanza|decreto/i.test(testo(a)) && a !== avviso);
  const out = {};
  if (perizia) out.perizia = urlRisorsa(perizia.linkAllegato);
  if (avviso) out.avviso = urlRisorsa(avviso.linkAllegato);
  if (ordinanza) out.ordinanza = urlRisorsa(ordinanza.linkAllegato);
  return Object.keys(out).length ? out : null;
}

const primo = (beni, f) => { for (const b of beni) { const v = f(b); if (v !== null && v !== undefined && v !== '') return v; } return null; };
const breve = (s, n = 60) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t ? t.slice(0, n) : null; };
const pos = (n) => (typeof n === 'number' && n > 0 ? n : null);

// Dal corpo della risposta /restricted ai campi della scheda. Nessun campo di "soggetti", nessun codice fiscale.
export function estrai(b, { oggi, descLotto } = {}) {
  if (!b || typeof b !== 'object') return null;
  const beni = Array.isArray(b.beni) ? b.beni : [];
  const proc = b.procedura || {};
  const lotto = b.lotto || {};
  const fotoTutte = foto(beni);
  const cauz = cauzione(b.datiDeposito && b.datiDeposito.depoCauzionale);
  const spese = cauzione(b.datiDeposito && b.datiDeposito.depositoContoSpese);
  const anno = parseInt(proc.numeAnnoRg, 10);
  const s = {
    dettaglio: oggi || new Date().toISOString().slice(0, 10),
    descrizione: descrizione(descLotto || lotto.descLotto, beni),
    foto: fotoTutte.slice(0, MAX_FOTO),
    fotoTotali: fotoTutte.length,
    allegati: allegati(b.allegati),
    catasto: catasto(beni),
    vani: primo(beni, (x) => { const v = typeof x.numeroVani === 'number' ? x.numeroVani : parseFloat(String(x.numeroVani || '').replace(',', '.')); return v > 0 && v < 100 ? v : null; }),
    piano: primo(beni, (x) => breve(x.piano, 30)),
    mqScheda: superficieBeni(beni),
    cauzione: cauz.testo,
    cauzionePerc: cauz.perc,
    contoSpese: spese.testo,
    contoSpesePerc: spese.perc,
    modalita: breve(b.descModVendita),
    tipoVendita: breve(b.descTipoVendita),
    rialzo: pos(b.impoOffertaAumento),
    stima: pos(b.impoStima),
    termineOfferte: termine(b.dataTermPresOff, b.oraTermPresOff),
    rge: proc.numeRg && anno ? `${String(proc.numeRg).trim()}/${anno}` : (proc.numeRg ? String(proc.numeRg).trim() : null),
    annoProcedura: anno >= 1950 && anno <= 2100 ? anno : null,
    rito: breve(proc.descTipoRito, 50),
    esito: b.codEsito || null
  };
  for (const k of Object.keys(s)) if (s[k] === null || s[k] === undefined || (Array.isArray(s[k]) && !s[k].length)) delete s[k];
  return s;
}

/* ---------- ordine e scaricamento ---------- */

const piuGiorni = (data, g) => { const d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + g); return d.toISOString().slice(0, 10); };

// Ordine di lettura: prima le aste pubblicate negli ultimi 3 giorni (le più recenti prima), poi quelle con la data
// d'asta più vicina; in fondo quelle di oggi (il termine per le offerte è già scaduto).
export function ordina(aste, oggi) {
  const recenti = piuGiorni(oggi, -3);
  const gruppo = (a) => (a.pubblicata && a.pubblicata >= recenti ? 0 : a.dataAsta > oggi ? 1 : 2);
  return aste.map((a) => [gruppo(a), a]).sort((x, y) => x[0] - y[0] ||
    (x[0] === 0 ? (y[1].pubblicata || '').localeCompare(x[1].pubblicata || '') || (x[1].dataAsta || '').localeCompare(y[1].dataAsta || '')
      : (x[1].dataAsta || '').localeCompare(y[1].dataAsta || '') || (x[1].ora || '').localeCompare(y[1].ora || ''))).map((x) => x[1]);
}

// Scarica i dettagli (id numerici del PVP) uno ogni 3 secondi. Restituisce Map id → corpo della risposta.
//   - errori singoli (es. 404) si saltano; dopo 5 errori di fila ci si ferma;
//   - 401/403 su una vendita si salta: il PVP rifiuta alcune vendite una per una (verificato il 13/10/2026: la
//     vendita 4644696, appena pubblicata, rifiutata con 403 mentre la successiva rispondeva). Dopo 3 rifiuti di fila
//     si riprova UNA vendita già letta in questa raccolta: se rifiuta anche quella il sito ci sta bloccando e ci si
//     ferma (anche se non c'è ancora nessuna vendita letta da riprovare);
//   - 429 (rallentare) o robots.txt: ci si ferma subito.
export async function scarica(ids, { max = 600, log = console.log, leggi = leggiDettaglio, scadenza = Infinity } = {}) {
  const out = new Map();
  let errori = 0, richieste = 0, fermo = null, negati = 0, rifiutate = 0, controllo = null;
  for (const id of ids) {
    if (out.size >= max || Date.now() > scadenza) break;
    richieste++;
    try {
      const b = await leggi(id);
      if (b && typeof b === 'object') { out.set(id, b); errori = 0; negati = 0; controllo = id; } else errori++;
    } catch (e) {
      if (e instanceof FonteBloccata && e.stato !== 'errore') {
        if (e.http !== 401 && e.http !== 403) { fermo = e.message; break; }
        rifiutate++; negati++;
        log(`  ✗ dettaglio ${id}: ${e.message}, saltato`);
        if (negati >= 3) {
          let bloccato = true;
          if (controllo != null) {
            richieste++;
            try { await leggi(controllo); bloccato = false; } catch (e2) { bloccato = e2 instanceof FonteBloccata; }
          }
          if (bloccato) { fermo = `${e.message} su 3 vendite di fila` + (controllo != null ? ' e su una già letta' : ''); break; }
          negati = 0;
        }
      } else {
        errori++;
        log(`  ✗ dettaglio ${id}: ${e.message}`);
      }
    }
    if (errori >= 5) { fermo = '5 errori di fila'; break; }
    if (richieste % 50 === 0) log(`  dettagli: ${out.size} letti su ${richieste} richieste`);
  }
  if (fermo) log(`  ✗ lettura dei dettagli interrotta: ${fermo}`);
  return { dettagli: out, richieste, fermo, rifiutate };
}

export async function leggiDettaglio(id) {
  const r = await richiesta(urlDettaglio(id), { intestazioni: { Accept: 'application/json' }, json: true, intervalloMs: INTERVALLO_MS });
  return r && r.body;
}
