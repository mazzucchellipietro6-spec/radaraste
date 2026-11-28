// Mappa interattiva (27/11/2026): ricerca dei luoghi accessibile, distanza senza far uscire la posizione dal browser,
// colori e filtri nuovi collegati ai controlli. Prove nel browser: telefono e computer, tema chiaro e scuro.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'mappa.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'mappa.js'), 'utf8');

test('cerca un luogo: campo combobox con etichetta e elenco di opzioni collegato', () => {
  assert.match(html, /<label class="sr-only" for="mCercaInput">[^<]+<\/label>/);
  const input = html.match(/<input id="mCercaInput"[^>]*>/)[0];
  for (const a of ['role="combobox"', 'aria-autocomplete="list"', 'aria-expanded="false"', 'aria-controls="mCercaLista"']) assert.ok(input.includes(a), a);
  assert.match(html, /<ul class="m-cerca-lista" id="mCercaLista" role="listbox"/);
  // frecce, Invio ed Esc dalla tastiera; l'opzione attiva è annunciata
  for (const k of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) assert.ok(js.includes("e.key === '" + k + "'"), k);
  assert.match(js, /setAttribute\('aria-activedescendant'/);
});

test('distanza: la posizione resta nel browser e non entra nei link condivisi', () => {
  assert.match(html, /La tua posizione resta in questo browser: non viene inviata a nessuno e non entra nei link condivisi\./);
  // il raggio si salva solo in sessionStorage (la scheda del browser), con il resto dei filtri
  assert.match(js, /function salvaFiltri\(\) \{ scriviSessione\(K_FILTRI, \{ filtri: filtri, extra: extra, raggio: raggio \}\); \}/);
  assert.match(js, /function scriviSessione\(k, v\) \{ try \{ sessionStorage\.setItem/);
  assert.doesNotMatch(js, /localStorage\.setItem\([^)]*raggio/);
  // link della vista: mai il raggio; con "Vicino a me" nemmeno la vista, che è centrata sulla persona
  const link = js.slice(js.indexOf('function linkVista()'), js.indexOf('function condividiVista()'));
  assert.ok(link.length > 100);
  assert.doesNotMatch(link, /raggio\.lat|raggio\.lng/);
  assert.match(link, /if \(!\(raggio && raggio\.te\)\) parti\.push\('vista='/);
  // i filtri che arrivano da un link o dall'elenco cancellano il raggio
  assert.match(js, /function daElenco\(f\) \{\n\s+filtri = copia\(VUOTI\); extra = \{\}; raggio = null;/);
  // la posizione si chiede solo con il pulsante, non all'apertura della pagina
  assert.equal((js.match(/navigator\.geolocation\.getCurrentPosition\(/g) || []).length, 1);
  assert.match(js.slice(js.indexOf('function vicinoAMe()'), js.indexOf('function vicinoAMe()') + 600), /navigator\.geolocation\.getCurrentPosition/);
});

test('filtri nuovi e "Colora per": controlli nella pagina e valori ammessi nel codice', () => {
  for (const id of ['mGiorni', 'mSconto', 'mKm', 'mColora', 'mPrezzi', 'mVicino', 'mScegliPunto', 'mTogliRaggio', 'mCondividi', 'mOrdina']) assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(js, /var GIORNI = \[7, 14, 30, 60, 90\], SCONTI = \[0\.1, 0\.2, 0\.3, 0\.4\], KM = \[5, 10, 25, 50, 100\];/);
  for (const v of ['7', '14', '30', '60', '90']) assert.ok(html.includes('<option value="' + v + '">'), 'giorni ' + v);
  for (const v of ['5', '10', '25', '50', '100']) assert.ok(new RegExp('<option value="' + v + '">' + v + ' km</option>').test(html), 'km ' + v);
  // sconto per colori e filtri: solo valori di affidabilità media o alta, come la mappa di calore
  assert.match(js, /function scontoAffidabile\(a\) \{ var s = sconto\(a\); return s != null && AFFIDABILE\[a\.affidabilita\] \? s : null; \}/);
  assert.match(html, /<option value="punteggio">Punteggio affare<\/option>\s*<option value="sconto">Sconto sul valore<\/option>\s*<option value="data">Data dell'asta<\/option>/);
});
