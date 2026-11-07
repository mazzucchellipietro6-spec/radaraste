// Test veloci senza browser: node --test tests/unit/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash, flatten, splitBlocks, collectEntry } from '../../src/i18n/core.mjs';
import { pathFor, resolve, translatePath } from '../../src/i18n/routes.mjs';
import { dirOf, MAIN_CODES } from '../../src/i18n/languages.mjs';

test('impronta dei testi: stabile e diversa per testi diversi', () => {
  assert.equal(hash('Statuario'), hash('Statuario'));
  assert.notEqual(hash('Statuario'), hash('Calacatta'));
});

test('flatten e splitBlocks', () => {
  assert.deepEqual(flatten({ a: { b: 'x', c: { d: 'y' } } }), { 'a.b': 'x', 'a.c.d': 'y' });
  assert.deepEqual(splitBlocks('Uno\n\nDue\r\n\r\nTre'), ['Uno', 'Due', 'Tre']);
});

test('contenuti: i blocchi Markdown diventano chiavi numerate', () => {
  const keys = collectEntry('marbles', 'x', { tagline: 'T', description: 'A\n\nB' }).map((m) => m.key);
  assert.deepEqual(keys, ['marbles/x/tagline', 'marbles/x/description.0', 'marbles/x/description.1']);
});

test('indirizzi localizzati: andata e ritorno', () => {
  for (const lang of MAIN_CODES) {
    const p = pathFor(lang, 'marble', 'statuario');
    const r = resolve(lang, p.replace(`/${lang}/`, '').replace(/\/$/, ''));
    assert.equal(r?.key, 'marble', `${lang}: ${p}`);
  }
  assert.equal(pathFor('de', 'marbles'), '/de/marmor/');
  assert.equal(translatePath('/it/marmi/statuario/', 'it', 'en'), '/en/marbles/statuario/');
  assert.equal(translatePath('/it/account/profile/', 'it', 'de'), '/de/account/profile/');
});

test('direzione del testo', () => {
  assert.equal(dirOf('ar'), 'rtl');
  assert.equal(dirOf('he'), 'rtl');
  assert.equal(dirOf('ja'), 'ltr');
});
