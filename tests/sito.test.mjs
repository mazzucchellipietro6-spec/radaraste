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

test('ogni voce del menu (sezioni, assistenti, strumenti) è una pagina che esiste, senza doppioni', async () => {
  const U = menu();
  const voci = [...U.NAV, ...U.ASSISTENTI, ...U.STRUMENTI].map((v) => v.href);
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
