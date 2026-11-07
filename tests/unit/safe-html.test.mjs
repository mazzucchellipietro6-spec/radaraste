// Testi editoriali e traduzioni corrette dal pannello: niente script nelle pagine pubbliche (audit S1, S2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeHtml, jsonForScript } from '../../src/lib/safe-html.ts';

test('toglie script, gestori di eventi, iframe e link javascript:', () => {
  const dirty = '<p onclick="steal()">Ciao <script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://evil"></iframe>'
    + '<a href="javascript:alert(1)">x</a><a href="https://www.carrara.it" target="_blank">ok</a></p>';
  const clean = safeHtml(dirty);
  assert.doesNotMatch(clean, /script|onerror|onclick|iframe|javascript:|<img/i);
  assert.match(clean, /<a href="https:\/\/www\.carrara\.it" target="_blank" rel="noopener noreferrer">ok<\/a>/);
  assert.match(clean, /^<p>Ciao /);
});

test('mantiene la formattazione editoriale', () => {
  const html = '<h3>Titolo</h3><p><strong>Marmo</strong> e <em>luce</em></p><ul><li>uno</li></ul>';
  assert.equal(safeHtml(html), html);
});

test('il JSON-LD non può chiudere lo script', () => {
  const out = jsonForScript({ name: '</script><script>alert(1)</script>' });
  assert.doesNotMatch(out, /<\/script>/i);
  assert.equal(JSON.parse(out).name, '</script><script>alert(1)</script>');
});
