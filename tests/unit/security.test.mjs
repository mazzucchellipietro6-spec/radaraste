import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSP, SECURITY_HEADERS } from '../../src/lib/security-headers.mjs';

test('CSP: niente incorporamento in altri siti, niente plugin, form solo verso destinazioni note', () => {
  assert.match(CSP, /frame-ancestors 'none'/);
  assert.match(CSP, /object-src 'none'/);
  assert.match(CSP, /form-action 'self' https:\/\/checkout\.stripe\.com/);
  assert.doesNotMatch(CSP, /unsafe-eval/);
});

test('intestazioni di base presenti', () => {
  for (const h of ['x-content-type-options', 'referrer-policy', 'strict-transport-security', 'permissions-policy']) assert.ok(SECURITY_HEADERS[h], h);
});
