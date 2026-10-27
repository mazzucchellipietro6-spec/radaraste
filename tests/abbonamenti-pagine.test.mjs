// Pagine della zona abbonamenti (modalità test): Prezzi e bozze legali (termini, privacy, cookie, recesso, avvertenze).
// Struttura comune, bozze senza dati inventati, prezzi letti solo da config/abbonamenti.js, pulsanti della pagina Prezzi.
// Nessuna rete e nessuna chiave: la logica della pagina Prezzi si prova con contesti finti.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const CFG = require('../config/abbonamenti.js');
const Piani = require('../js/piani.js');
const Prezzi = require('../js/pages/prezzi.js');

const BOZZE = ['termini.html', 'privacy.html', 'cookie.html', 'recesso.html', 'avvertenze.html'];
const PAGINE = ['prezzi.html', ...BOZZE];
const leggi = (f) => readFile(path.join(RADICE, f), 'utf8');
const NBSP = ' ';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// testo visibile, senza tag (per cercare cifre e indirizzi solo nel contenuto)
const testo = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
const conCfg = (modifiche) => Object.assign(structuredClone(CFG), modifiche);
// contesto della pagina Prezzi: di base abbonamenti spenti, nessuna anteprima, nessun account
const ctx = (extra) => Object.assign({ cfg: CFG, periodo: 'mensile', attivi: false, anteprima: false, vendita: false, configurato: false, utente: null, piano: 'gratis' }, extra);
const UTENTE = { id: 'utente-finto', email: 'prova@example.com' };
const piano = (id, c = CFG) => c.piani.find((p) => p.id === id);
const scheda = (id, contesto) => Prezzi.htmlPiano(piano(id, contesto.cfg), contesto);

/* ---------- struttura comune ---------- */

test('ogni pagina nuova ha la struttura comune del sito', async () => {
  for (const f of PAGINE) {
    const t = await leggi(f);
    assert.match(t, /^<!doctype html>\n<html lang="it">/, f);
    assert.match(t, /<title>[^<]{3,} – Radar Aste Italia<\/title>/, f + ': titolo');
    assert.match(t, /<meta name="description" content="[^"]{30,}">/, f + ': descrizione');
    assert.match(t, /<meta name="viewport" content="width=device-width, initial-scale=1">/, f);
    assert.match(t, /<a class="salta" href="#contenuto">Salta al contenuto<\/a>\n<header id="site-header"><\/header>/, f + ': intestazione comune');
    assert.match(t, /<main class="wrap stack" id="contenuto" tabindex="-1">[\s\S]+<\/main>\n\n<footer id="site-footer"><\/footer>/, f + ': main#contenuto e piè di pagina');
    assert.equal(t.match(/<main\b/g).length, 1, f + ': un solo main');
    assert.equal(t.match(/<h1\b/g).length, 1, f + ': un solo h1');
    for (const css of ['style.css', 'assistenti.css', 'abbonamenti.css']) assert.ok(t.includes('<link rel="stylesheet" href="assets/css/' + css + '">'), f + ': ' + css);
    for (const s of ['js/icone.js', 'js/ui.js']) assert.ok(t.includes('<script src="' + s + '"></script>'), f + ': ' + s);
    // bozze e prezzi proposti restano fuori dai motori di ricerca finché il proprietario non li approva
    assert.ok(t.includes('<meta name="robots" content="noindex">'), f + ': noindex');
  }
});

test('ogni link interno a un\'ancora porta a un id che esiste, senza id doppi', async () => {
  for (const f of PAGINE) {
    const t = await leggi(f);
    const id = [...t.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(id).size, id.length, f + ': id doppi');
    // (le icone <use href="#i-…"> puntano allo sprite che js/icone.js aggiunge alla pagina)
    for (const [, a] of t.matchAll(/<a\b[^>]*\shref="#([^"]+)"/g)) assert.ok(id.includes(a), f + ': #' + a + ' non esiste');
    for (const [, a] of t.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)) assert.ok(id.includes(a), f + ': ' + a + ' non esiste');
  }
});

/* ---------- bozze legali ---------- */

test('bozze legali: fascia BOZZA in cima, data di ultima modifica, indice e segnaposto del titolare', async () => {
  for (const f of BOZZE) {
    const t = await leggi(f);
    const bozza = t.indexOf('BOZZA da far verificare a un professionista prima della pubblicazione');
    assert.ok(bozza > 0, f + ': fascia BOZZA');
    assert.ok(bozza < t.indexOf('<h1'), f + ': la fascia BOZZA viene prima del titolo');
    assert.match(t, /Ultima modifica: <time datetime="\d{4}-\d{2}-\d{2}">[^<]+<\/time>/, f + ': data di ultima modifica');
    const indice = t.match(/<nav class="legale-indice"[\s\S]*?<\/nav>/);
    assert.ok(indice, f + ': indice');
    const voci = [...indice[0].matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    assert.ok(voci.length >= 5, f + ': indice troppo corto');
    for (const v of voci) assert.match(t, new RegExp('<section id="' + v + '"'), f + ': sezione ' + v);
    for (const dato of ['ragione sociale', 'sede', 'partita IVA', 'email e PEC']) {
      assert.ok(t.includes('[DA COMPLETARE: ' + dato), f + ': segnaposto ' + dato);
    }
    // ogni segnaposto è evidenziato
    assert.equal((t.match(/\[DA COMPLETARE/g) || []).length, (t.match(/<mark class="da-completare">\[DA COMPLETARE/g) || []).length, f + ': segnaposto non evidenziati');
  }
});

test('bozze legali: nessun dato del titolare inventato (partita IVA, indirizzi, email, telefoni)', async () => {
  for (const f of BOZZE) {
    const grezzo = await leggi(f), t = testo(grezzo);
    assert.doesNotMatch(t, /\d(?:[ .]?\d){10}/, f + ': sequenza di 11 cifre (partita IVA?)');
    assert.doesNotMatch(grezzo, /\d{11}/, f + ': sequenza di 11 cifre nel codice della pagina');
    assert.doesNotMatch(t, /\b(?:P\.?\s?IVA|partita IVA)\s*:?\s*(?:IT)?\s*\d/i, f + ': partita IVA scritta');
    assert.doesNotMatch(t, /\b(?:[Vv]ia|[Vv]iale|[Pp]iazza|[Pp]iazzale|[Cc]orso|[Ll]argo|[Vv]icolo)\s+[A-ZÀ-Ý][^\s,]*(?:\s+[A-ZÀ-Ý][^\s,]*)*,?\s+\d+/, f + ': indirizzo');
    assert.doesNotMatch(t, /\b\d{5}\s+[A-ZÀ-Ý][a-zà-ÿ]+/, f + ': CAP e città');
    assert.doesNotMatch(t, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, f + ': indirizzo email');
    assert.doesNotMatch(t, /\+39|\b0\d{1,3}[ .-]?\d{6,8}\b/, f + ': numero di telefono');
    assert.doesNotMatch(grezzo, /mailto:|tel:/, f + ': link di contatto inventati');
  }
});

test('termini: servizio informativo, nessuna consulenza, fonti, account, piani, rinnovo, prova, disdetta, IVA, foro', async () => {
  const t = await leggi('termini.html');
  for (const s of ['servizio informativo', 'Nessuna consulenza', 'consulenza finanziaria', 'href="fonti.html"', 'Account', 'href="prezzi.html"',
    'IVA', 'Rinnovo automatico', 'si rinnova automaticamente', 'Prova gratuita', 'Disdetta', 'portale clienti', 'href="recesso.html"', 'Responsabilità',
    'legge italiana', 'art. 66-bis del Codice del Consumo', 'art. 1229 del Codice civile']) assert.ok(t.includes(s), 'termini: ' + s);
  // la durata della prova è quella della configurazione
  assert.ok(t.includes('(oggi ' + CFG.prova.giorni + ' giorni)'), 'termini: giorni di prova come in config/abbonamenti.js');
});

test('privacy: informativa art. 13 con titolare, dati, basi giuridiche, fornitori, trasferimenti, diritti e Garante', async () => {
  const t = await leggi('privacy.html');
  for (const s of ['art. 13 del Regolamento (UE) 2016/679', 'Titolare del trattamento', 'email', 'Stripe', 'non li vede e non li conserva',
    'art. 6, par. 1, lett. b', 'art. 6, par. 1, lett. c', 'art. 6, par. 1, lett. f', 'Per quanto tempo', 'art. 2220 del Codice civile',
    'Supabase', 'Cloudflare', 'Servizi di invio email', 'art. 28', 'Stati Uniti', 'art. 45', 'art. 46',
    'Responsabile della protezione dei dati', 'Dati obbligatori e facoltativi', 'Decisioni automatizzate', 'Legittimo interesse', 'art. 77 GDPR',
    'artt. 15-22', 'art. 15', 'art. 16', 'art. 17', 'art. 18', 'art. 20', 'art. 21', 'art. 22', 'art. 77',
    'href="https://www.garanteprivacy.it"']) assert.ok(t.includes(s), 'privacy: ' + s);
});

test('cookie: solo strumenti tecnici, linee guida del Garante e Stripe solo sulle sue pagine', async () => {
  const t = await leggi('cookie.html');
  for (const s of ['localStorage', 'sessionStorage', 'Sessione dell\'account', 'nessuna statistica', 'profilazione', 'Stripe', 'solo sulle sue pagine di pagamento',
    '10 giugno 2021', 'Garante', 'href="https://www.garanteprivacy.it"', 'art. 122']) assert.ok(t.includes(s), 'cookie: ' + s);
});

// tutte le chiavi radaraste.* scritte nel codice del sito: la pagina dei cookie deve descriverle tutte
async function fileJs(cartella) {
  const voci = await readdir(path.join(RADICE, cartella), { withFileTypes: true });
  const out = [];
  for (const v of voci) {
    const rel = path.join(cartella, v.name);
    if (v.isDirectory()) out.push(...await fileJs(rel));
    else if (/\.m?js$/.test(v.name)) out.push(rel);
  }
  return out;
}
test('cookie: elenca ogni chiave radaraste.* che il sito salva nel browser', async () => {
  const cookie = await leggi('cookie.html');
  const file = [...await fileJs('js'), ...await fileJs('config'), ...(await readdir(RADICE)).filter((f) => f.endsWith('.html'))];
  const chiavi = new Map();
  for (const f of file) {
    for (const [, k] of (await leggi(f)).matchAll(/['"](radaraste\.[A-Za-z0-9._-]*[A-Za-z0-9])['"]/g)) if (!chiavi.has(k)) chiavi.set(k, f);
  }
  assert.ok(chiavi.size >= 15, 'trovate poche chiavi: ' + [...chiavi.keys()]);
  for (const [k, f] of chiavi) assert.ok(cookie.includes('<code>' + k + '</code>'), 'cookie.html non descrive la chiave ' + k + ' (usata in ' + f + '): aggiungila alla tabella');
});

test('recesso: 14 giorni, Codice del Consumo artt. 52-59 con Normattiva, rimborso, art. 57 e modulo tipo', async () => {
  const t = await leggi('recesso.html');
  for (const s of ['14 giorni', 'decreto legislativo 6 settembre 2005, n. 206', 'artt. 52-59', 'art. 52', 'art. 54', 'art. 56', 'art. 57, comma 3', 'art. 59',
    'entro 14 giorni dal giorno in cui riceviamo', 'allegato I, parte B', 'Modulo di recesso tipo',
    'compilare e restituire il presente modulo solo se si desidera recedere dal contratto', 'Cancellare la dicitura inutile']) assert.ok(t.includes(s), 'recesso: ' + s);
  const link = [...t.matchAll(/href="(https:\/\/www\.normattiva\.it\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(link.length >= 5, 'recesso: link a Normattiva');
  for (const u of link) assert.match(u, /^https:\/\/www\.normattiva\.it\/uri-res\/N2Ls\?urn:nir:stato:decreto\.legislativo:2005-09-06;206(~art5[2-9])?$/, u);
});

test('avvertenze: non è consulenza, stime che possono sbagliare, avviso e perizia, nessuna garanzia di aggiudicazione', async () => {
  const t = await leggi('avvertenze.html');
  for (const s of ['non è consulenza finanziaria', 'consulenza finanziaria o in materia di investimenti', 'consulenza legale, fiscale', 'immobiliare',
    'Le stime possono essere sbagliate', 'avviso di vendita', 'perizia', 'Nessuna garanzia di aggiudicazione', 'href="https://pvp.giustizia.it"']) assert.ok(t.includes(s), 'avvertenze: ' + s);
});

/* ---------- pagina Prezzi: HTML ---------- */

test('prezzi.html: avvisi di modalità test e abbonamenti spenti, script nell\'ordine giusto', async () => {
  const t = await leggi('prezzi.html');
  assert.ok(t.includes('Modalità test: nessun pagamento reale'), 'avviso di modalità test');
  assert.ok(t.includes('Abbonamenti non ancora attivi'), 'avviso abbonamenti spenti');
  assert.match(t, /id="pzTest"[^>]*role="note"/);
  const pos = ['js/ui.js', 'config/abbonamenti.js', 'js/piani.js', 'js/account.js', 'js/pages/prezzi.js'].map((s) => t.indexOf('<script src="' + s + '"></script>'));
  for (const p of pos) assert.ok(p > 0, 'script mancante');
  assert.deepEqual([...pos].sort((a, b) => a - b), pos, 'ordine degli script');
  for (const s of ['termini.html', 'recesso.html', 'privacy.html', 'cookie.html', 'avvertenze.html', 'account.html']) assert.ok(t.includes('href="' + s + '"'), 'link a ' + s);
  // domande frequenti
  for (const s of ['portale clienti', 'entro 14 giorni', 'Stripe', 'IVA inclusa', 'non consulenza finanziaria']) assert.ok(t.includes(s), 'domande: ' + s);
});

test('prezzi.html: nessun prezzo scritto a mano, tutto viene da config/abbonamenti.js', async () => {
  const t = await leggi('prezzi.html');
  assert.doesNotMatch(t, /\d\s*(?:€|&euro;|euro\b)|€\s*\d/i, 'prezzo nell\'HTML');
  assert.doesNotMatch(t, /\d+\s*(?:\/\s*mese|al mese|all'anno|\/\s*anno)/i, 'prezzo nell\'HTML');
  for (const p of CFG.piani) assert.ok(!t.includes(p.sottotitolo), 'testi dei piani copiati nell\'HTML: ' + p.id);
});

/* ---------- pagina Prezzi: piani e pulsanti ---------- */

test('pulsanti con abbonamenti spenti: disattivati con spiegazione, il piano Gratis porta alle aste', () => {
  const c = ctx();
  assert.deepEqual(Prezzi.azione(piano('gratis'), c), { tipo: 'link', testo: 'Cerca le aste', href: 'aste.html' });
  const base = Prezzi.azione(piano('base'), c), pro = Prezzi.azione(piano('pro'), c);
  assert.equal(base.tipo, 'disattivato');
  assert.equal(base.testo, 'Scegli Base');
  assert.match(base.nota, /non ancora attivi/);
  assert.equal(pro.tipo, 'disattivato');
  assert.equal(pro.testo, 'Prova Pro gratis per ' + CFG.prova.giorni + ' giorni');
  const h = scheda('pro', c);
  assert.match(h, /<button class="btn" type="button" disabled aria-describedby="pz-nota-pro">/);
  assert.match(h, /<p class="note" id="pz-nota-pro">Abbonamenti non ancora attivi/);
  assert.doesNotMatch(h, /data-azione|accedi\.html/);
});

test('pulsanti in anteprima senza account: portano ad accedi.html?dopo=prezzi.html', () => {
  assert.equal(Prezzi.ACCEDI, 'accedi.html?dopo=prezzi.html');
  for (const extra of [{ anteprima: true, vendita: true }, { anteprima: true, vendita: true, configurato: true }, { vendita: true, configurato: false, utente: UTENTE }]) {
    const c = ctx(extra);
    for (const id of ['base', 'pro']) {
      const a = Prezzi.azione(piano(id), c);
      assert.equal(a.tipo, 'accedi', JSON.stringify(extra));
      assert.equal(a.href, 'accedi.html?dopo=prezzi.html');
      assert.ok(scheda(id, c).includes('<a class="btn' + (id === 'pro' ? '' : ' ghost') + '" href="accedi.html?dopo=prezzi.html">'));
    }
    assert.equal(Prezzi.azione(piano('gratis'), c).tipo, 'link');
  }
});

test('pulsanti con utente collegato: checkout dal piano Gratis, portale clienti con un piano a pagamento', () => {
  const gratis = ctx({ vendita: true, attivi: true, configurato: true, utente: UTENTE, piano: 'gratis' });
  assert.equal(Prezzi.azione(piano('gratis'), gratis).tipo, 'attuale');
  assert.match(scheda('gratis', gratis), /pz-piano attuale/);
  for (const id of ['base', 'pro']) {
    assert.equal(Prezzi.azione(piano(id), gratis).tipo, 'checkout');
    assert.ok(scheda(id, gratis).includes('data-azione="checkout" data-piano="' + id + '"'));
  }
  const base = ctx({ vendita: true, attivi: true, configurato: true, utente: UTENTE, piano: 'base' });
  assert.deepEqual(Prezzi.azione(piano('base'), base), { tipo: 'portale', testo: 'Gestisci l\'abbonamento', attuale: true });
  assert.equal(Prezzi.azione(piano('pro'), base).tipo, 'portale');
  assert.equal(Prezzi.azione(piano('gratis'), base).tipo, 'link');
  const h = scheda('base', base);
  assert.match(h, /<span class="pz-bollino attuale">Il tuo piano<\/span>/);
  assert.ok(h.includes('data-azione="portale" data-piano="base"'));
  assert.doesNotMatch(scheda('pro', base), /checkout/);
  // chi è già abbonato cambia piano dal portale: niente promessa di una nuova prova gratuita
  assert.doesNotMatch(scheda('pro', base), /prova gratuita|Prova Pro/);
  assert.match(scheda('pro', gratis), /giorni di prova gratuita/);
});

test('schede dei piani: prezzi dalla configurazione, mensile e annuale con il risparmio, IVA inclusa', () => {
  const m = ctx(), a = ctx({ periodo: 'annuale' });
  const pro = scheda('pro', m), proA = scheda('pro', a), baseA = scheda('base', a), gratis = scheda('gratis', m);
  assert.ok(pro.includes('<span class="pz-cifra">24' + NBSP + '€</span><span class="pz-per">al mese</span>'));
  assert.ok(pro.includes('Oppure 240' + NBSP + '€ all\'anno (2 mesi gratis). IVA inclusa.'));
  assert.ok(proA.includes('<span class="pz-cifra">240' + NBSP + '€</span><span class="pz-per">all\'anno</span>'));
  assert.ok(proA.includes('Pari a 20' + NBSP + '€ al mese: <b>risparmi 48' + NBSP + '€</b> rispetto al mensile. IVA inclusa.'));
  assert.ok(baseA.includes('Pari a 7,50' + NBSP + '€ al mese: <b>risparmi 18' + NBSP + '€</b>'));
  assert.ok(gratis.includes('<span class="pz-cifra">0' + NBSP + '€</span><span class="pz-per">senza costi</span>'));
  assert.equal(Prezzi.etichettaAnnuale(CFG), '2 mesi gratis');
  assert.equal(Prezzi.risparmio(piano('pro')), Piani.risparmioAnnuale('pro'));
  assert.equal(Prezzi.risparmio(piano('base')), Piani.risparmioAnnuale('base'));
  // con altri prezzi la pagina cambia da sola
  const c = conCfg({ ivaInclusa: false });
  piano('pro', c).prezzi = { mensile: 11, annuale: 99 };
  const altra = Prezzi.htmlPiano(piano('pro', c), ctx({ cfg: c }));
  assert.ok(altra.includes('11' + NBSP + '€') && altra.includes('99' + NBSP + '€ all\'anno (3 mesi gratis).'));
  assert.ok(!altra.includes('24' + NBSP + '€') && !altra.includes('IVA inclusa'));
  assert.equal(Prezzi.etichettaAnnuale(c), 'fino al 25% in meno');
});

test('schede dei piani: Pro consigliato con la prova gratuita, ancore per "Sblocca con…", vantaggi "in arrivo"', () => {
  const c = ctx();
  const pro = scheda('pro', c), base = scheda('base', c);
  assert.match(pro, /^<article class="pz-piano consigliato" id="pro" aria-labelledby="pz-nome-pro"><span class="pz-bollino">Consigliato<\/span>/);
  assert.ok(pro.includes('<span class="pill p-good">' + CFG.prova.giorni + ' giorni di prova gratuita</span>'));
  assert.equal(pro.match(/giorni di prova gratuita/g).length, 1, 'la prova non si ripete tra i vantaggi');
  assert.doesNotMatch(base, /prova gratuita|consigliato/);
  // il riquadro delle funzioni bloccate porta alla scheda giusta
  for (const f of Object.keys(CFG.funzioni)) {
    const id = Piani.pianoMinimo(f), h = Piani.blocco({ funzione: f });
    assert.ok(h.includes('href="prezzi.html#' + id + '"'), f);
    assert.ok(scheda(id, c).includes(' id="' + id + '"'), f);
  }
  // "(in arrivo)" diventa un'etichetta, mai testo tra parentesi
  assert.ok(base.includes('<span class="pill p-neutral">in arrivo</span>'));
  assert.doesNotMatch(base + pro, /\(in arrivo\)/);
  for (const v of piano('base').vantaggi) assert.ok(base.includes(esc(v.replace(/\s*\(in arrivo\)$/, ''))), v);
});

test('schede dei piani: i testi della configurazione sono protetti', () => {
  const c = conCfg({});
  Object.assign(piano('base', c), { nome: '<img src=x onerror=alert(1)>', sottotitolo: '"><script>', vantaggi: ['<b>grassetto</b> (in arrivo)'] });
  const h = Prezzi.htmlPiano(piano('base', c), ctx({ cfg: c }));
  assert.doesNotMatch(h, /<img|<script|<b>grassetto/);
  assert.ok(h.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

/* ---------- pagina Prezzi: confronto ---------- */

test('confronto: una riga per funzione a pagamento, con i limiti del piano Gratis e la prova', () => {
  const righe = Prezzi.righeConfronto(CFG);
  const funzioni = Object.keys(CFG.funzioni);
  assert.equal(righe.length, funzioni.length + 2, 'riga iniziale (tutti) + funzioni + prova');
  assert.ok(righe[0].celle.every((x) => x.incluso === true), 'le funzioni di base sono di tutti');
  const per = (f) => righe.find((r) => r.funzione === f);
  for (const f of funzioni) {
    const r = per(f), min = CFG.piani.findIndex((p) => p.id === CFG.funzioni[f]);
    assert.equal(r.nome, CFG.nomiFunzioni[f]);
    r.celle.forEach((cel, i) => { if (i >= min) assert.equal(cel.incluso, true, f + ' ' + i); else assert.ok(cel.incluso === false || cel.testo, f + ' ' + i); });
  }
  assert.deepEqual(per('affari-tutti').celle[0], { testo: 'I primi ' + CFG.limitiGratis.affari });
  assert.deepEqual(per('combinazioni-tutte').celle[0], { testo: 'Le prime ' + CFG.limitiGratis.combinazioni });
  assert.deepEqual(per('seguite-illimitate').celle[0], { testo: 'Fino a ' + CFG.limitiGratis.seguite });
  assert.deepEqual(per('stratega').celle.map((x) => x.incluso), [false, false, true]);
  assert.equal(per('report-pdf').inArrivo, false);   // il report PDF è nella scheda dal 19/10
  assert.equal(per('stratega').inArrivo, false);
  assert.deepEqual(righe[righe.length - 1].celle, [{ incluso: false }, { incluso: false }, { testo: CFG.prova.giorni + ' giorni' }]);
  // con la lista "inArrivo" nella configurazione vale quella
  assert.equal(Prezzi.righeConfronto(conCfg({ inArrivo: [] })).some((r) => r.inArrivo), false);
});

test('confronto: tabella accessibile e leggibile su telefono, con i prezzi del periodo scelto', () => {
  const h = Prezzi.htmlConfronto(ctx()), ha = Prezzi.htmlConfronto(ctx({ periodo: 'annuale' }));
  assert.match(h, /^<table class="pz-confronto"><caption class="sr-only">/);
  for (const n of Object.values(CFG.nomiFunzioni)) assert.ok(h.includes('<th scope="row" class="pz-f">' + esc(n)), n);
  for (const p of CFG.piani) assert.ok(h.includes('<td data-label="' + p.nome + '"'), p.id);
  assert.ok(h.includes('<span class="sr-only">Incluso</span>') && h.includes('<span class="sr-only">Non incluso</span>'));
  assert.ok(h.includes('Pro<span class="pz-th-prezzo">24' + NBSP + '€ al mese</span>'));
  assert.ok(ha.includes('Pro<span class="pz-th-prezzo">240' + NBSP + '€ all\'anno</span>'));
  assert.equal((h.match(/<tr>/g) || []).length, Prezzi.righeConfronto(CFG).length + 1);
});

test('abbonamenti spenti davvero solo con attivi:true e Supabase configurato', () => {
  assert.equal(Prezzi.attiviDavvero(CFG), false);
  assert.equal(Prezzi.attiviDavvero(conCfg({ attivi: true })), false);
  assert.equal(Prezzi.attiviDavvero(conCfg({ attivi: true, supabase: { url: 'https://progetto-finto.supabase.co', chiaveAnonima: 'chiave-anonima-finta' } })), true);
});

/* ---------- stili e stile del codice ---------- */

test('abbonamenti.css: componenti condivisi di js/piani.js e classi delle pagine, solo colori dai token', async () => {
  const css = await leggi('assets/css/abbonamenti.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'colore scritto a mano');
  assert.doesNotMatch(css, /\b(?:rgba?|hsla?|oklch|lab)\(/, 'colore scritto a mano');
  const definita = (c) => new RegExp('\\.' + c.replace(/[-]/g, '\\-') + '(?![\\w-])').test(css);
  // classi prodotte da Piani.blocco e Piani.avvisoAnteprima
  for (const c of ['blocco-piano', 'blocco-piano-titolo', 'blocco-piano-testo', 'avviso-anteprima']) assert.ok(definita(c), c);
  const blocco = Piani.blocco({ funzione: 'stratega', livello: 3 });
  for (const [, cl] of blocco.matchAll(/class="([^"]+)"/g)) for (const c of cl.split(/\s+/)) if (/^(blocco|avviso)-/.test(c)) assert.ok(definita(c), c);
  // ogni classe pz-, legale- e da-completare usata dalle pagine e dalla pagina Prezzi esiste nel foglio di stile
  let html = Prezzi.htmlConfronto(ctx()) + CFG.piani.map((p) => scheda(p.id, ctx()) + scheda(p.id, ctx({ vendita: true, configurato: true, utente: UTENTE, piano: 'base' }))).join('');
  for (const f of PAGINE) html += await leggi(f);
  const classi = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => /^(pz|legale)-|^da-completare$/.test(c)));
  assert.ok(classi.size > 30);
  for (const c of classi) assert.ok(definita(c), 'classe senza stile: ' + c);
});

test('codice per il browser in ES5, nessuna emoji, nessuna chiave', async () => {
  const js = await leggi('js/pages/prezzi.js');
  assert.doesNotMatch(js, /=>|`|\b(?:let|const|class)\s/, 'sintassi ES5 come il resto delle pagine');
  for (const f of [...PAGINE, 'js/pages/prezzi.js', 'assets/css/abbonamenti.css']) {
    const t = await leggi(f);
    assert.doesNotMatch(t, /\p{Extended_Pictographic}/u, f + ': emoji');
    assert.doesNotMatch(t, /sk_(?:live|test)_|pk_(?:live|test)_|rk_(?:live|test)_|whsec_|eyJ[A-Za-z0-9_-]{20,}/, f + ': chiave');
  }
});

/* ---------- revisione: coerenza con quello che il sito fa davvero, interruttore, contrasto ---------- */

test('interruttore Mensile/Annuale: due radio vere in un fieldset con legenda, risparmio nell\'etichetta, focus visibile', async () => {
  const t = await leggi('prezzi.html'), css = await leggi('assets/css/abbonamenti.css'), js = await leggi('js/pages/prezzi.js');
  const f = t.match(/<fieldset class="pz-periodo">([\s\S]*?)<\/fieldset>/);
  assert.ok(f, 'fieldset dell\'interruttore');
  assert.match(f[1], /^\s*<legend class="sr-only">Periodo di pagamento<\/legend>/);
  const radio = [...f[1].matchAll(/<label class="pz-scelta"><input type="radio" name="pzPeriodo" value="(\w+)"( checked)?><span>/g)];
  assert.deepEqual(radio.map((m) => m[1]), ['mensile', 'annuale'], 'ogni radio dentro la sua etichetta');
  assert.deepEqual(radio.map((m) => Boolean(m[2])), [true, false], 'all\'avvio è scelto Mensile');
  assert.match(f[1], /value="annuale"><span>Annuale <span class="pill p-good" id="pzRisparmio" hidden><\/span><\/span>/, 'il risparmio fa parte del nome di "Annuale"');
  // niente pulsanti con aria-pressed al posto di una scelta esclusiva
  assert.doesNotMatch(t, /aria-pressed|data-periodo/);
  assert.ok(js.includes('input[name="pzPeriodo"]') && js.includes('\'change\''), 'la pagina ascolta le radio');
  assert.match(css, /\.pz-scelta input\[type=radio\] \{[^}]*opacity: 0;/, 'radio invisibile ma raggiungibile');
  assert.doesNotMatch(css, /\.pz-scelta input[^{]*\{[^}]*display: none/, 'una radio con display:none non si raggiunge con la tastiera');
  assert.match(css, /\.pz-scelta input:checked \+ span \{[^}]*background: var\(--accent\)/);
  assert.match(css, /\.pz-scelta input:focus-visible \+ span \{[^}]*outline: 2px solid var\(--accent\)/);
});

test('contrasto: i colori delle pagine degli abbonamenti si leggono in tema chiaro e scuro (almeno 4,5:1)', async () => {
  const style = await leggi('assets/css/style.css'), css = await leggi('assets/css/abbonamenti.css');
  const blocco = (sel) => {
    const i = style.indexOf(sel + ' {');
    assert.ok(i >= 0, 'token di ' + sel);
    const o = {};
    for (const m of style.slice(i, style.indexOf('}', i)).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) o[m[1]] = m[2];
    return o;
  };
  const rgb = (h) => (Array.isArray(h) ? h : [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const lum = (h) => rgb(h).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const contrasto = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const misto = (a, b, p) => rgb(a).map((x, i) => Math.round(x * p + rgb(b)[i] * (1 - p)));
  // testo (primo colore) sullo sfondo (secondo) come li usa assets/css/abbonamenti.css
  const COPPIE = [['muted', 'surface'], ['muted', 'bg'], ['muted', 'surface-3'], ['fg-2', 'surface'], ['accent-ink', 'accent'], ['accent-ink', 'good'],
    ['good', 'surface'], ['good', 'good-bg'], ['warn', 'warn-bg'], ['info', 'info-bg'], ['fg', 'warn-bg'], ['fg', 'info-bg']];
  for (const [tema, t] of [['chiaro', blocco(':root')], ['scuro', blocco(':root[data-theme="dark"]')]]) {
    for (const [a, b] of COPPIE) assert.ok(contrasto(t[a], t[b]) >= 4.5, tema + ': --' + a + ' su --' + b + ' = ' + contrasto(t[a], t[b]).toFixed(2));
    // colonna del piano consigliato nella tabella (--accent-soft al 60% sulla superficie)
    const colonna = misto(t['accent-soft'], t.surface, 0.6);
    for (const a of ['muted', 'fg-2', 'accent']) assert.ok(contrasto(t[a], colonna) >= 4.5, tema + ': --' + a + ' sulla colonna Pro');
  }
  // --faint non basta per un testo (2,9:1 nel tema chiaro): il trattino "non incluso" usa --muted
  assert.doesNotMatch(css, /(?<![\w-])color:\s*var\(--faint\)/);
  assert.match(css, /\.pz-no \{ color: var\(--muted\); \}/);
});

test('vantaggi dei piani: "in arrivo" solo per ciò che il sito non fa ancora, il resto esiste davvero', async () => {
  const vantaggi = CFG.piani.flatMap((p) => p.vantaggi.map((v) => ({ piano: p.id, v })));
  const inArrivo = vantaggi.filter((x) => /\(in arrivo\)$/.test(x.v));
  // la tabella (Prezzi.IN_ARRIVO) e le schede (vantaggi della configurazione) dicono la stessa cosa
  const PAROLA = { avvisi: /avvisi/i, 'consulente-ai': /intelligenza artificiale/i, 'statistiche-avanzate': /statistiche/i };
  assert.equal(inArrivo.length, Prezzi.IN_ARRIVO.length, 'vantaggi "(in arrivo)": ' + inArrivo.map((x) => x.v).join(' | '));
  for (const f of Prezzi.IN_ARRIVO) {
    assert.ok(PAROLA[f], f + ': aggiungi la parola chiave a questo test');
    assert.ok(inArrivo.some((x) => x.piano === CFG.funzioni[f] && PAROLA[f].test(x.v)), f + ': manca "(in arrivo)" tra i vantaggi del piano ' + CFG.funzioni[f]);
  }
  // quello che è "in arrivo" non c'è ancora: il consulente con intelligenza artificiale è spento
  assert.equal(require('../config/consulente.js').ponte, null, 'consulente con IA acceso: togli "(in arrivo)" dai piani e da Prezzi.IN_ARRIVO');
  // quello che si vende come pronto esiste nel sito
  assert.ok(!Prezzi.IN_ARRIVO.includes('report-pdf'));
  assert.ok(vantaggi.some((x) => x.piano === 'base' && /^Report PDF/.test(x.v) && !/in arrivo/.test(x.v)), 'report PDF tra i vantaggi del Base');
  assert.ok((await leggi('js/pages/scheda.js')).includes('Stampa o salva in PDF'), 'il report PDF è nella scheda dell\'asta');
  assert.ok(vantaggi.some((x) => /promemoria in calendario/.test(x.v)));
  assert.ok((await leggi('js/pages/scheda.js')).includes('text/calendar') && (await leggi('js/pages/mie-aste.js')).includes('text/calendar'), 'promemoria .ics');
  assert.ok(vantaggi.some((x) => x.piano === 'pro' && /migliaia di scenari simulati/.test(x.v)));
  assert.ok(require('../js/stratega.js').PARAMETRI.simulazioni >= 1000, 'lo Stratega simula migliaia di scenari');
  // i limiti del piano Gratis vengono dalla configurazione, mai scritti a mano nella pagina
  const t = await leggi('prezzi.html');
  for (const n of Object.values(CFG.limitiGratis)) assert.doesNotMatch(testo(t), new RegExp('(?:primi|prime|fino a)\\s+' + n + '\\b', 'i'));
});

test('termini e domande frequenti come il server: prova solo al primo abbonamento, cancellazione che annulla l\'abbonamento', async () => {
  const termini = await leggi('termini.html'), prezzi = await leggi('prezzi.html');
  const checkout = await leggi('functions/api/stripe/checkout.js'), cancella = await leggi('functions/api/account/cancella.js');
  // functions/api/stripe/checkout.js dà la prova solo a chi non ha mai avuto un abbonamento
  assert.match(checkout, /const prova = piano === 'pro' && !haGiaAvuto\(precedente\) && !suStripe\.length;/);
  assert.equal(CFG.prova.piano, 'pro');
  for (const [f, t] of [['termini', termini], ['prezzi', prezzi]]) {
    assert.ok(t.includes('solo al primo abbonamento'), f + ': prova solo al primo abbonamento');
    assert.doesNotMatch(t, /una sola volta per persona/, f + ': il server controlla l\'account, non la persona');
  }
  // functions/api/account/cancella.js annulla subito l'abbonamento Stripe prima di cancellare l'account
  assert.match(cancella, /chiamaStripe\(env, 'DELETE', '\/subscriptions\/'/);
  assert.ok(termini.includes('Se cancelli l\'account, anche l\'abbonamento in corso viene annullato subito'));
  assert.doesNotMatch(termini, /non annulla da sola/);
  // IVA: dipende dal regime fiscale, che decide il titolare
  assert.ok(termini.includes('[DA COMPLETARE: regime IVA del titolare'));
});

test('privacy e cookie: ogni servizio esterno che il browser contatta è descritto', async () => {
  const privacy = await leggi('privacy.html'), cookie = await leggi('cookie.html'), headers = await leggi('_headers');
  const csp = headers.match(/Content-Security-Policy: ([^\n]+)/)[1];
  const host = [...csp.matchAll(/https:\/\/([^\s;]+)/g)].map((m) => m[1]);
  assert.ok(host.length >= 3, 'indirizzi esterni nella CSP');
  // indirizzo esterno → nome del servizio nelle due pagine (Supabase solo nell'informativa: nel browser c'è la sessione, già descritta)
  const SERVIZIO = { 'tile.openstreetmap.org': 'OpenStreetMap', 'nominatim.openstreetmap.org': 'OpenStreetMap', 'resource-pvp.giustizia.it': 'Portale delle Vendite Pubbliche', '*.supabase.co': 'Supabase' };
  for (const h of host) {
    assert.ok(SERVIZIO[h], h + ': servizio nuovo nella Content-Security-Policy, descrivilo in privacy.html e cookie.html e aggiungilo a questo test');
    assert.ok(privacy.includes(SERVIZIO[h]), 'privacy.html: ' + SERVIZIO[h]);
    if (h !== '*.supabase.co') assert.ok(cookie.includes(SERVIZIO[h]), 'cookie.html: ' + SERVIZIO[h]);
  }
  // il sito oggi è pubblicato anche su GitHub Pages (workflow): chi lo ospita riceve i dati di navigazione
  if ((await leggi('.github/workflows/aggiorna-aste.yml')).includes('actions/configure-pages')) assert.ok(privacy.includes('GitHub Pages'));
  // le email sull'abbonamento partono con Resend (servizi/email.js)
  if ((await leggi('servizi/email.js')).includes('api.resend.com')) assert.ok(privacy.includes('Resend'));
  // fornitori: solo nomi e sedi certi, il resto è un segnaposto
  assert.doesNotMatch(privacy, /Supabase[^<]{0,30}\(Stati Uniti\)/, 'sede di Supabase da verificare nel suo accordo');
  assert.ok(privacy.includes('[DA COMPLETARE: ragione sociale e sede di Supabase'));
  assert.ok(privacy.includes('[DA COMPLETARE: verificare nell\'accordo di Stripe'));
});
