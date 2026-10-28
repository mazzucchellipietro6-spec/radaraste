// Calcolatore "Conviene?" (js/pages/calcolatore.js) aperto da una card o dalla scheda ("Calcolo completo"):
// valore di mercato del sito con forchetta, fonte e affidabilità, offerta massima con la regola della scheda
// e offerta minima dell'avviso. La pagina gira in un contesto finto con la UI vera (js/ui.js) e le tariffe vere.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RADICE = path.join(__dirname, '..');
const T = require('../config/tariffe.js');
const P = require('../js/punteggio.js');

// asta reale dei dati locali del 28/10/2026 (data/aste.js), con i campi che usano scheda e calcolatore
const FERMO = {
  id: 'pvp-4622646', titolo: 'Porzione di fabbricato ad uso industriale al PS1 di mq 774', categoria: 'immobile', tipo: 'Immobile industriale', regione: 'Marche', provincia: 'FM',
  comune: 'Montegranaro', tribunale: 'Fermo', rge: '83', fonte: 'Portale Vendite Pubbliche', prezzoBase: 83543.75, offertaMinima: 63407.82, dataAsta: '2026-11-30', ora: '11:00', stato: 'nd',
  linkAvviso: 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=4622646', tentativo: 3, superficieMq: 774, valore: 178020, valoreMin: 154800, valoreMax: 201240,
  fonteValore: 'omi', affidabilita: 'media', costoTotale: 92663, sconto: 0.479, offertaMax: 112100, punteggio: 88, primoPrezzo: 267200, omiMin: 154800, omiMax: 201240
};

const testo = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/ | /g, ' ').replace(/\s+/g, ' ').trim();

function elemento(id) {
  const on = {};
  return {
    id, value: '', hidden: false, innerHTML: '', textContent: '', checked: false, dataset: {}, style: {}, className: '', on,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(tipo, fn) { (on[tipo] = on[tipo] || []).push(fn); }, setAttribute() {}, focus() {}, scrollIntoView() {}, insertAdjacentHTML() {},
    querySelector: () => null, querySelectorAll: () => []
  };
}

// apre calcolatore.html?id=... con l'asta indicata; restituisce gli elementi della pagina per id
function apri(asta) {
  const el = {}, prendi = (id) => (el[id] = el[id] || elemento(id));
  const avvio = [];
  const documento = {
    body: elemento('body'), documentElement: { setAttribute() {}, getAttribute: () => null },
    getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => []
  };
  const finto = {
    location: { pathname: '/calcolatore.html', search: '?id=' + encodeURIComponent(asta.id) }, navigator: { userAgent: 'node' }, matchMedia: () => ({ matches: false }), addEventListener() {},
    history: { replaceState() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: documento, console, Intl, Date, Math, JSON, Number, String, Object, Array, isFinite, isNaN, parseFloat, encodeURIComponent, URLSearchParams
  };
  finto.window = finto;
  const ctx = vm.createContext(finto);
  for (const f of ['config/tariffe.js', 'data/geo.js', 'js/icone.js', 'js/ui.js', 'js/calcoli.js']) vm.runInContext(fs.readFileSync(path.join(RADICE, f), 'utf8'), ctx, { filename: f });
  ctx.Store = { asta: (id) => (id === asta.id ? asta : null), seguita: () => null, seguite: () => [], segui() {} };
  // da qui la pagina trova i suoi elementi
  documento.querySelector = (sel) => prendi(sel[0] === '#' ? sel.slice(1) : sel);
  documento.addEventListener = (tipo, fn) => { if (tipo === 'DOMContentLoaded') avvio.push(fn); };
  vm.runInContext(fs.readFileSync(path.join(RADICE, 'js/pages/calcolatore.js'), 'utf8'), ctx, { filename: 'js/pages/calcolatore.js' });
  avvio.forEach((fn) => fn());
  return { el: prendi, ctx };
}

test('calcolatore aperto dalla scheda: valore di mercato del sito nel campo, con forchetta, fonte e affidabilità', () => {
  const { el } = apri(FERMO);
  // prima il campo restava vuoto: il codice leggeva a.valoreMercato, che le aste raccolte non hanno
  assert.equal(String(el('iMercato').value), '178020');
  assert.equal(String(el('iBase').value), '83543.75');
  const nota = testo(el('iValoreSito').innerHTML);
  assert.equal(el('iValoreSito').hidden, false);
  assert.match(nota, /Valore di mercato del sito: 178\.020 € \(forchetta 154\.800 € – 201\.240 €\)/);
  assert.match(nota, /Fonte: quotazioni OMI della zona \(Agenzia delle Entrate\)/);
  assert.match(nota, /Affidabilità: media/);
  // il risultato si calcola subito, senza "Inserisci almeno la tua offerta e il valore di mercato"
  assert.doesNotMatch(testo(el('outImm').innerHTML), /Inserisci almeno/);
});

test('calcolatore: offerta massima con la regola della scheda (valore minimo della forchetta, stesse ipotesi), offerta minima dell\'avviso', () => {
  const { el } = apri(FERMO);
  const out = testo(el('outImm').innerHTML);
  // la scheda mostra l'offerta massima della raccolta (js/asta.js), calcolata da js/punteggio.js sul valore minimo
  assert.equal(P.valuta({ ...FERMO, parti: undefined }, { T }).offertaMax, FERMO.offertaMax);
  assert.match(out, /Offerta massima consigliata per restare circa il 20% sotto il valore minimo stimato \(154\.800 €\), costi compresi: 112\.100 €/);
  // prima: 138.000 €, sul valore centrale (178.020 €) e con il regime prima casa
  assert.doesNotMatch(out, /138\.000 €/);
  assert.equal(el('iRegime').value, 'seconda-privato');
  // offerta minima: quella dell'avviso (63.407,82 €), non il 75% calcolato (62.657,81 €); la differenza si segnala
  assert.match(out, /Offerta minima ammessa \(dall'avviso\) 63\.408 €/);
  assert.doesNotMatch(out, /Offerta minima ammessa \(75%[^)]*\) 62\.658 €/);
  assert.match(out, /non è il 75% del prezzo base \(62\.658 €\): uso quella dell'avviso, ma verifica/);
  assert.equal(String(el('iOfferta').value), '63407.82');
  assert.doesNotMatch(out, /non sarebbe valida/);
  // tre strategie: "Ci vivo" con la forchetta del sito (anche in percentuale); la rivendita senza lavori al valore del campo,
  // non al massimo della forchetta (201.240 €), come dice la nota della pagina
  assert.match(out, /Ci vivo \d{2,3}\.\d{3} € – \d{3}\.\d{3} € risparmio rispetto a comprarla sul mercato \(\d+,\d% – \d+,\d%\)/);
  assert.match(out, /Vendita a 178\.020 €/);
  assert.doesNotMatch(out, /Vendita a 201\.240 €/);
});

test('calcolatore: con un valore scritto a mano l\'offerta massima usa quello, e un\'offerta sotto la minima dell\'avviso è segnalata', () => {
  const { el } = apri(FERMO);
  el('iMercato').value = '200000';
  el('iOfferta').value = '63000';   // sopra il 75% calcolato, sotto la minima dell'avviso
  el('fImm').on.input.forEach((fn) => fn());
  const out = testo(el('outImm').innerHTML);
  assert.match(out, /sotto il valore di mercato indicato \(200\.000 €\), costi compresi: \d{3}\.\d00 €/);
  assert.match(out, /L'offerta è sotto l'offerta minima dell'avviso: non sarebbe valida/);
  // asta occupata: liberazione come nella scheda (3.000 €), non 1.500 €
  const occ = apri({ ...FERMO, id: 'pvp-occ', stato: 'occupato' });
  assert.equal(String(occ.el('iLiberazione').value), '3000');
  const html = fs.readFileSync(path.join(RADICE, 'calcolatore.html'), 'utf8');
  // la prima opzione con valore 3000 è quella neutra (non "da terzi senza titolo"): è quella che si vede selezionata
  assert.match(html, /<option value="0">Libero<\/option>\s*<option value="3000">Occupato, non si sa da chi/);
  assert.match(html, /<p class="note" id="iValoreSito" hidden><\/p>/);
  assert.match(html, /<p class="note" id="vValoreSito" hidden><\/p>/);
});
