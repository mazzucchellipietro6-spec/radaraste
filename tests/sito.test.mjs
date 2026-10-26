// Integrità del sito: ogni pagina del menu esiste e ha la stessa struttura, ogni file collegato esiste,
// tutto è nella cache offline (sw.js) e nel sito pubblicato non finisce nulla che non deve.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// file prodotti dalla raccolta del mattino: possono mancare nel repository
const GENERATI = new Set(['data/aste.js', 'data/riepilogo.js', 'data/affari.js', 'data/combinazioni.js', 'data/statistiche.js']);
const esiste = (f) => access(path.join(RADICE, f)).then(() => true, () => false);

async function pagine() { return (await readdir(RADICE)).filter((f) => f.endsWith('.html')).sort(); }

// voci del menu, lette da js/ui.js senza un browser
function menu() {
  const finto = { location: { pathname: '/index.html', search: '' }, document: { getElementById: () => null, addEventListener() {}, querySelector: () => null },
    matchMedia: () => ({ matches: false }), addEventListener() {} };   // navigator: quello di Node (in sola lettura) va bene
  const vecchio = {}; for (const k of Object.keys(finto)) { vecchio[k] = globalThis[k]; globalThis[k] = finto[k]; }
  globalThis.window = globalThis;
  delete require.cache[require.resolve('../js/ui.js')];
  require('../js/ui.js');
  const U = globalThis.UI;
  for (const k of Object.keys(finto)) globalThis[k] = vecchio[k];
  return U;
}

test('ogni voce del menu (sezioni, assistenti, strumenti, piè di pagina) è una pagina che esiste, senza doppioni', async () => {
  const U = menu();
  const voci = [...U.NAV, ...U.ASSISTENTI, ...U.STRUMENTI, ...U.SERVIZIO].map((v) => v.href);
  assert.deepEqual(U.NAV.map((v) => v.nome), ['Home', 'Aste', 'Mappa', 'Assistenti', 'Strumenti', 'Le mie aste']);
  assert.equal(U.ASSISTENTI.length, 5);
  assert.equal(new Set(voci).size, voci.length, 'nessuna pagina in due posti del menu');
  for (const h of voci) assert.ok(await esiste(h), h + ' manca');
});

test('ogni pagina: lingua italiana, titolo, descrizione, intestazione e piè di pagina comuni, stile e script di base', async () => {
  for (const f of await pagine()) {
    const t = await readFile(path.join(RADICE, f), 'utf8');
    assert.match(t, /<html lang="it">/, f);
    assert.match(t, /<title>[^<]+<\/title>/, f);
    assert.match(t, /<meta name="description" content="[^"]{30,}">/, f + ': descrizione');
    assert.match(t, /<meta name="viewport"/, f);
    assert.match(t, /<header id="site-header"><\/header>/, f);
    assert.match(t, /<footer id="site-footer"><\/footer>/, f);
    assert.match(t, /assets\/css\/style\.css/, f);
    assert.match(t, /<a class="salta" href="#contenuto">/, f);
    assert.match(t, /id="contenuto"/, f);
    for (const s of ['js/icone.js', 'js/ui.js']) assert.ok(t.includes('src="' + s + '"'), f + ': ' + s);
    assert.doesNotMatch(t, /archivo|hanken|martian/i, f + ': vecchi font');
  }
});

test('ogni file locale collegato dalle pagine esiste (script, stili, immagini, link interni)', async () => {
  for (const f of await pagine()) {
    const t = await readFile(path.join(RADICE, f), 'utf8');
    const rif = [...t.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)].map((m) => m[1]).filter((u) => !/^(https?:|mailto:|data:|\/\/)/.test(u));
    for (const u of rif) {
      if (GENERATI.has(u)) continue;
      assert.ok(await esiste(u), f + ' → ' + u + ' non esiste');
    }
  }
});

test('cache offline: sw.js contiene tutte le pagine e solo file che esistono', async () => {
  const sw = await readFile(path.join(RADICE, 'sw.js'), 'utf8');
  const lista = JSON.parse(sw.slice(sw.indexOf('[', sw.indexOf('var STRUTTURA')), sw.indexOf('];', sw.indexOf('var STRUTTURA')) + 1).replace(/'/g, '"'));
  for (const f of await pagine()) assert.ok(lista.includes(f), f + ' manca in sw.js');
  for (const u of lista) if (u !== './') assert.ok(await esiste(u), 'sw.js → ' + u + ' non esiste');
});

test('nessuna chiave o segreto nel codice pubblicato', async () => {
  const cartelle = ['js', 'js/pages', 'config', 'functions/api', 'scripts', 'scripts/lib'];
  for (const c of cartelle) {
    let file = [];
    try { file = (await readdir(path.join(RADICE, c))).filter((f) => /\.(m?js)$/.test(f)); } catch { continue; }
    for (const f of file) {
      const t = await readFile(path.join(RADICE, c, f), 'utf8');
      assert.doesNotMatch(t, /sk-ant-[A-Za-z0-9_-]{10,}|sk_(live|test)_[A-Za-z0-9]{10,}|\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/, c + '/' + f + ': sembra una chiave');
    }
  }
  const cfg = require('../config/consulente.js');
  assert.equal(cfg.ponte, null, 'la modalità AI resta spenta finché non la attiva il proprietario');
});

test('nessun link vuoto: un link senza testo nelle pagine resta nascosto finché non ha un nome', async () => {
  // un <a href> vuoto si raggiunge con Tab ma non dice dove porta (home: "Tutte le N →" quando non ci sono altre aste)
  for (const f of await pagine()) {
    const t = await readFile(path.join(RADICE, f), 'utf8');
    for (const m of t.matchAll(/<a\b([^>]*\bhref="[^"]*"[^>]*)>\s*<\/a>/g)) assert.match(m[1], /\bhidden\b|aria-label="[^"]+"/, f + ': ' + m[0]);
  }
  const home = await readFile(path.join(RADICE, 'js/pages/home.js'), 'utf8');
  assert.match(home, /a\.hidden = !altre/, 'la home mostra il link solo quando ha il testo');
});

test('fontiFerme: una fonte non aggiornata oggi si riconosce, con il giorno delle aste che restano', async () => {
  const U = menu();
  // stato delle fonti scritto in data/aste.js dalla raccolta locale del 22/10/2026 (il Portale non rispondeva)
  const R = { fonti: [
    { nome: 'Portale Vendite Pubbliche', stato: 'errore', aste: 20215, ultimaRaccolta: '2026-10-13T14:45:37.203Z' },
    { nome: 'Agenzia del Demanio', stato: 'attiva', aste: 3, ultimaRaccolta: '2026-10-22T06:20:04.369Z' },
    { nome: 'Aste Giudiziarie Inlinea', stato: 'vietata' },
    { nome: 'IVG – Istituti Vendite Giudiziarie', stato: 'errore' }
  ] };
  assert.deepEqual(U.fontiFerme(R), [{ nome: 'Portale Vendite Pubbliche', data: '2026-10-13' }]);
  assert.deepEqual(U.fontiFerme(null), []);
  assert.deepEqual(U.fontiFerme({ fonti: [{ nome: 'X', stato: 'errore', ultimaRaccolta: 'non è una data' }] }), []);
  // sui dati veri, se ci sono: solo fonti in errore o bloccate, ognuna con un giorno
  if (await esiste('data/aste.js')) {
    const ctx = { window: {} };
    (await import('node:vm')).runInNewContext(await readFile(path.join(RADICE, 'data/aste.js'), 'utf8'), ctx);
    const stati = Object.fromEntries((ctx.window.ASTE_RACCOLTE.fonti || []).map((f) => [f.nome, f.stato]));
    for (const f of U.fontiFerme(ctx.window.ASTE_RACCOLTE)) { assert.ok(['errore', 'bloccata'].includes(stati[f.nome]), f.nome); assert.match(f.data, /^\d{4}-\d{2}-\d{2}$/); }
  }
  // le pagine che lo dicono: elenco, consulente e home
  for (const p of ['js/pages/aste.js', 'js/pages/consulente.js', 'js/pages/home.js']) assert.match(await readFile(path.join(RADICE, p), 'utf8'), /U\.fontiFerme\(R\)/, p);
});

test('home: una fonte ferma dice il giorno dell\'ultima raccolta riuscita, letto da R.agenti.fonti del riepilogo', async () => {
  const U = menu();
  // la funzione della home, eseguita da sola con la UI vera
  const home = await readFile(path.join(RADICE, 'js/pages/home.js'), 'utf8');
  const src = home.match(/\n  function noteFerme\(R\) \{[\s\S]*?\n  \}\n/)[0];
  const noteFerme = new Function('U', src + 'return noteFerme;')(U);
  // riepilogo scritto dalla raccolta del 22/10/2026: nei campi "fonti" solo nome e stato, l'ultima raccolta è in agenti.fonti
  const R = () => ({ aggiornato: '2026-10-22T06:20:24.194Z',
    fonti: [{ nome: 'Portale Vendite Pubbliche', stato: 'errore' }, { nome: 'Agenzia del Demanio', stato: 'attiva' }, { nome: 'IVG – Istituti Vendite Giudiziarie', stato: 'errore' }],
    agenti: { fonti: [{ nome: 'Portale Vendite Pubbliche', stato: 'errore', aste: 20215, ultimaRaccolta: '2026-10-13T14:45:37.203Z' },
      { nome: 'Agenzia del Demanio', stato: 'attiva', aste: 3, ultimaRaccolta: '2026-10-22T06:20:04.369Z' },
      { nome: 'IVG – Istituti Vendite Giudiziarie', stato: 'errore', aste: null, ultimaRaccolta: null }] } });
  const tredici = U.dataIt('2026-10-13');
  const vecchio = R();
  assert.deepEqual(noteFerme(vecchio), ['Portale Vendite Pubbliche: il ' + U.dataIt('2026-10-22') + ' nessun aggiornamento, restano le aste dell\'ultima raccolta riuscita (' + tredici + ')']);
  const diOggi = R(); diOggi.aggiornato = new Date().toISOString();
  assert.deepEqual(noteFerme(diOggi), ['Portale Vendite Pubbliche: oggi nessun aggiornamento, restano le aste dell\'ultima raccolta riuscita (' + tredici + ')']);
  // tutte aggiornate: nessuna nota
  const ok = R(); ok.fonti[0].stato = 'attiva'; ok.agenti.fonti[0].stato = 'attiva';
  assert.deepEqual(noteFerme(ok), []);
  assert.match(home, /noteFerme\(R\)\.map/, 'la home scrive le note accanto alla data');
});

test('accessibilità: scheda senza asta con un h1, fuoco visibile sulla domanda della home', async () => {
  const scheda = await readFile(path.join(RADICE, 'js/pages/scheda.js'), 'utf8');
  assert.match(scheda, /function vuota\([\s\S]{0,300}'<h1>' \+ titolo \+ '<\/h1>/, 'il titolo della scheda vuota (asta non trovata, nessuna asta) è un h1');
  const css = await readFile(path.join(RADICE, 'assets/css/style.css'), 'utf8');
  // il campo dentro .chiedi non ha bordo né ombra: il segno del fuoco è sul riquadro
  assert.match(css, /\.chiedi:focus-within \{[^}]*box-shadow: 0 0 0 4px var\(--accent-glow\)/);
});
