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
