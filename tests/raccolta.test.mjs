import test from 'node:test';
import assert from 'node:assert/strict';
import { analizzaRobots, consentito } from '../scripts/lib/http.mjs';
import { provincia, titolo } from '../scripts/lib/luoghi.mjs';

test('robots.txt: regole per tutti gli agenti', () => {
  const r = analizzaRobots('User-agent: *\nAllow: /\nDisallow: /*?*hash=\nDisallow: /CmsFiles/\n');
  assert.equal(consentito(r, '/Aste/Detail/B123'), true);
  assert.equal(consentito(r, '/CmsFiles/x.pdf'), false);
  assert.equal(consentito(r, '/lista?pagina=2&hash=abc'), false);
});

test('robots.txt: gruppo specifico per il nostro agente', () => {
  const r = analizzaRobots('User-agent: *\nDisallow:\n\nUser-agent: RadarAsteItalia\nDisallow: /\n');
  assert.equal(consentito(r, '/qualsiasi'), false);
});

test('robots.txt vuoto o "Disallow:" vuoto non vieta nulla', () => {
  assert.equal(consentito(analizzaRobots(''), '/x'), true);
  assert.equal(consentito(analizzaRobots('User-agent: *\nDisallow:\n'), '/x'), true);
});

test('province scritte in modi diversi', () => {
  assert.equal(provincia('Genova').sigla, 'GE');
  assert.equal(provincia('Monza e della Brianza').sigla, 'MB');
  assert.equal(provincia("Reggio nell'Emilia").sigla, 'RE');
  assert.equal(provincia('Bolzano/Bozen').sigla, 'BZ');
  assert.equal(provincia('Forlì-Cesena').sigla, 'FC');
  assert.equal(provincia('LIVORNO').sigla, 'LI');
  assert.equal(provincia('Paese inesistente'), null);
});

test('sedi di tribunale non capoluogo', () => {
  assert.equal(provincia('Napoli Nord in Aversa').sigla, 'CE');
  assert.equal(provincia('Tivoli').sigla, 'RM');
  assert.equal(provincia('Termini Imerese').sigla, 'PA');
  assert.equal(provincia('Monza').sigla, 'MB');
  assert.equal(provincia('Potenza Ex Tribunale di Melfi').sigla, 'PZ');
});

test('nomi di comuni in maiuscolo/minuscolo', () => {
  assert.equal(titolo('GRAVINA IN PUGLIA'), 'Gravina in Puglia');
  assert.equal(titolo('reggio di calabria'), 'Reggio di Calabria');
});

import { unisci, numeroProcedura } from '../scripts/lib/doppioni.mjs';

test('doppioni: stessa vendita su PVP e su un gestore', () => {
  const pvp = [{ id: 'pvp-1', fonte: 'Portale Vendite Pubbliche', tribunale: 'Genova', rge: '412', dataAsta: '2026-11-18', prezzoBase: 120000, linkAvviso: 'https://pvp/1' }];
  const al = [
    { id: 'al-1', fonte: 'Astalegale', tribunale: 'GENOVA', rge: '412/2024', dataAsta: '2026-11-18', prezzoBase: 120000.4, linkAvviso: 'https://al/1' },
    { id: 'al-2', fonte: 'Astalegale', tribunale: 'Genova', rge: '412/2024', dataAsta: '2026-11-18', prezzoBase: 80000, linkAvviso: 'https://al/2' }, // altro lotto
    { id: 'al-3', fonte: 'Astalegale', tribunale: 'Milano', rge: '9/2025', dataAsta: '2026-12-01', prezzoBase: 50000, linkAvviso: 'https://al/3' }
  ];
  const r = unisci([pvp, al]);
  assert.equal(r.doppioni, 1);
  assert.deepEqual(r.aste.map((a) => a.id), ['pvp-1', 'al-2', 'al-3']);
  assert.deepEqual(r.aste[0].altriLink, [['Astalegale', 'https://al/1']]);
});

test('doppioni: senza tribunale o procedura non si unisce nulla', () => {
  const r = unisci([[{ id: 'a', fonte: 'X', dataAsta: '2026-11-18', linkAvviso: 'u1' }], [{ id: 'b', fonte: 'Y', dataAsta: '2026-11-18', linkAvviso: 'u2' }]]);
  assert.equal(r.aste.length, 2);
  assert.equal(numeroProcedura('R.G.E. 0412/2024'), '412');
});
