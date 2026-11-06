// Il simulatore del pannello (src/lib/pricing.ts) deve dare gli stessi risultati del servizio agenti
// (agents/wc_agents/pricing.py) sugli stessi casi: tests/fixtures/pricing-cases.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, PricingError, r2 } from '../../src/lib/pricing.ts';

const cases = JSON.parse(readFileSync(new URL('../fixtures/pricing-cases.json', import.meta.url), 'utf8'));

for (const c of cases) {
  test(`prezzi: ${c.name}`, () => {
    const out = simulate(c.model, c.inputs);
    for (const [k, v] of Object.entries(c.expect)) {
      if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) assert.equal(out[k][kk], vv, `${k}.${kk}`);
      else assert.equal(out[k], v, k);
    }
  });
}

test('senza costo di acquisto non si calcola un prezzo', () => {
  assert.throws(() => simulate('resale', { quantity: { value: 1, status: 'verified' }, target_margin_rate: { value: 20, status: 'assumed' } }), PricingError);
});

test('arrotondamento commerciale', () => {
  assert.equal(r2(1.005), 1.01);
  assert.equal(r2(2.675), 2.68);
  assert.equal(r2(-1.005), -1.01);
});
