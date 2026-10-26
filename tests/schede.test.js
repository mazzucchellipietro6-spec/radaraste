// Card delle aste in elenco (js/schede.js): livello del titolo, data dell'asta e termine per le offerte.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RADICE = path.join(__dirname, '..');

// js/schede.js è solo per il browser: si esegue con la UI vera in un contesto finto
function schede() {
  const finto = {
    location: { pathname: '/aste.html', search: '' }, navigator: { userAgent: 'node' }, matchMedia: () => ({ matches: false }), addEventListener() {},
    document: { getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => null } },
    console, Intl, Date, Math, JSON, Number, String, isFinite, isNaN, encodeURIComponent
  };
  finto.window = finto;
  const ctx = vm.createContext(finto);
  for (const f of ['config/tariffe.js', 'js/icone.js', 'js/ui.js', 'js/formato.js', 'js/calcoli.js', 'js/schede.js']) vm.runInContext(fs.readFileSync(path.join(RADICE, f), 'utf8'), ctx, { filename: f });
  return { S: ctx.Schede, U: ctx.UI };
}

// asta reale del Demanio (raccolta del 22/10/2026) con i campi del nuovo lettore: asta l'11/11, offerte entro il 10/11 alle 16
const VENETO = { id: 'dem-Asta-pubblica-per-la-vendita-di-n.-25-lotti-di-beni-mobili-di-competenza-della-D', titolo: 'Asta pubblica per la vendita di n. 25 lotti di beni mobili di competenza della Direzione Regionale Veneto',
  categoria: 'auto', tipo: 'Asta pubblica', regione: 'Veneto', provincia: 'VE', comune: 'Mestre', fonte: 'Agenzia del Demanio', dataAsta: '2026-11-11', ora: '', termineOfferte: '2026-11-10T16:00',
  stato: 'nd', linkAvviso: 'https://www.agenziademanio.it/it/gare-aste/beni-mobili-e-veicoli-confiscati/gara/Asta-pubblica-per-la-vendita-di-n.-25-lotti-di-beni-mobili-di-competenza-della-Direzione-Regionale-Veneto' };

test('card: il titolo è un h3 (le card stanno sotto un h2 in home ed elenco aste) con la classe del suo aspetto', () => {
  const { S } = schede();
  const h = S.card(VENETO, {});
  assert.match(h, /<h3 class="card-titolo"><a href="scheda\.html\?id=dem-Asta-pubblica/);
  assert.doesNotMatch(h, /<h4/);
  const css = fs.readFileSync(path.join(RADICE, 'assets/css/style.css'), 'utf8');
  // stesso aspetto del vecchio h4: carattere del testo, 16px, grassetto, niente maiuscoletto
  assert.match(css, /\.card \.card-titolo \{ font-family: var\(--f-body\); font-size: 16px; font-weight: 600; line-height: 1\.4; letter-spacing: -\.005em; text-transform: none; color: var\(--fg\);/);
  assert.doesNotMatch(css, /\.card h4/);
});

test('card del Demanio: data dell\'asta come "Asta" e, sotto, il termine per le offerte con l\'ora', () => {
  const { S, U } = schede();
  const h = S.card(VENETO, {});
  assert.match(h, /<span class="sr-only">Asta: <\/span>/);
  assert.ok(h.includes('Offerte entro il ' + U.dataIt('2026-11-10') + ', 16:00'), h);
  // avviso senza il giorno dell'asta: la data è il termine, e lo si dice
  const solo = S.card({ ...VENETO, dataAsta: '2026-11-06', ora: '12:00', termineOfferte: '2026-11-06T12:00' }, {});
  assert.match(solo, /<span class="sr-only">Termine offerte: <\/span>/);
  assert.doesNotMatch(solo, /Offerte entro/);
  // PVP: termine con l'ora dal dettaglio (prima compariva "2026-12-02T12:00" così com'era)
  const pvp = S.card({ id: 'pvp-4595365', titolo: 'Merci in giacenza', categoria: 'beni', fonte: 'Portale Vendite Pubbliche', dataAsta: '2026-12-03', ora: '09:30', termineOfferte: '2026-12-02T12:00', prezzoBase: 114393.6 }, {});
  assert.ok(pvp.includes('Offerte entro il ' + U.dataIt('2026-12-02') + ', 12:00'), pvp);
  assert.doesNotMatch(pvp, /T12:00/);
});

test('card: date del Demanio raccolte prima del 26/10 (senza termineOfferte) e termine del PVP nel giorno stesso dell\'asta', () => {
  const { S, U } = schede();
  // stessa vendita nei dati locali del 22/10/2026: dataAsta era il termine per le offerte (10/11 alle 16:00)
  const vecchia = S.card({ ...VENETO, dataAsta: '2026-11-10', ora: '16:00', termineOfferte: undefined }, {});
  assert.match(vecchia, /<span class="sr-only">Termine offerte: <\/span>/);
  assert.ok(vecchia.includes(U.dataIt('2026-11-10') + ', 16:00'), vecchia);
  assert.doesNotMatch(vecchia, /Offerte entro/);
  // asta il giorno stesso del termine, a un'altra ora (dato dell'avviso): si dice anche l'ora del termine
  const stessoGiorno = S.card({ ...VENETO, dataAsta: '2026-11-10', ora: '', termineOfferte: '2026-11-10T09:00' }, {});
  assert.match(stessoGiorno, /<span class="sr-only">Asta: <\/span>/);
  assert.ok(stessoGiorno.includes('Offerte entro il ' + U.dataIt('2026-11-10') + ', 09:00'), stessoGiorno);
  // PVP: 152 aste nei dati del 13/10 hanno il termine con l'ora nel giorno dell'asta; la riga del termine resta
  const pvp = S.card({ id: 'pvp-x', titolo: 'Box', categoria: 'immobile', fonte: 'Portale Vendite Pubbliche', dataAsta: '2026-11-20', ora: '15:00', termineOfferte: '2026-11-20T12:00', prezzoBase: 10000 }, {});
  assert.ok(pvp.includes('Offerte entro il ' + U.dataIt('2026-11-20') + ', 12:00'), pvp);
  // termine senza ora nel giorno dell'asta: nessuna riga in più
  assert.doesNotMatch(S.card({ id: 'pvp-y', titolo: 'Box', categoria: 'immobile', fonte: 'Portale Vendite Pubbliche', dataAsta: '2026-11-20', ora: '15:00', termineOfferte: '2026-11-20', prezzoBase: 10000 }, {}), /Offerte entro/);
});
