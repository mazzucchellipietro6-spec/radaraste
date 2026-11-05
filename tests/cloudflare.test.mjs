// Cloudflare Pages: pubblicazione dal workflow (solo se configurata, chiavi solo dai secret, wrangler a versione
// esatta), wrangler.toml senza segreti e _headers con una CSP che copre ogni indirizzo esterno che il sito carica
// davvero: gli indirizzi si ricavano cercandoli nei file html, js e css del sito, così uno nuovo non sfugge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const leggi = (f) => readFile(path.join(RADICE, f), 'utf8');
const esiste = (f) => access(path.join(RADICE, f)).then(() => true, () => false);

// testi che somigliano a chiavi vere (Stripe, webhook, Resend, Supabase, token JWT, Anthropic)
const CHIAVI = [/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]+/, /\bwhsec_[A-Za-z0-9_]+/, /\bre_[A-Za-z0-9_]{8,}/, /\bsb_(secret|publishable)_[A-Za-z0-9_-]+/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, /\bsk-ant-[A-Za-z0-9_-]+/];

// --- workflow --------------------------------------------------------------------------------------------------------

// testo di un passo del workflow, dal suo "- name:" al passo successivo
function passo(y, nome) {
  const i = y.indexOf('- name: ' + nome);
  if (i < 0) return null;
  const fine = y.slice(i + 1).search(/\n {6}- /);
  return fine < 0 ? y.slice(i) : y.slice(i, i + 1 + fine);
}

test('workflow: Cloudflare Pages dopo GitHub Pages, solo se c\'è il progetto, token e account solo dai secret', async () => {
  const y = await leggi('.github/workflows/aggiorna-aste.yml');
  const cf = passo(y, 'Pubblica su Cloudflare Pages');
  assert.ok(cf, 'manca il passo "Pubblica su Cloudflare Pages"');
  assert.ok(y.indexOf('- name: Pubblica su Cloudflare Pages') > y.indexOf('- name: Prepara il sito'), 'dopo "Prepara il sito"');
  // dopo la pubblicazione su GitHub Pages: un ritardo di Cloudflare non deve portare il lavoro oltre il tempo massimo
  // prima che GitHub Pages sia pubblicato
  assert.ok(y.indexOf('- id: deploy') > 0 && y.indexOf('- name: Pubblica su Cloudflare Pages') > y.indexOf('- id: deploy'), 'dopo "deploy" (GitHub Pages)');
  assert.match(cf, /^\s+if: \$\{\{ vars\.CF_PAGES_PROGETTO != '' \}\}\s*$/m, 'parte solo con la variabile CF_PAGES_PROGETTO');
  assert.match(cf, /^\s+continue-on-error: true\s*$/m, 'un errore non deve fermare il resto');
  assert.match(cf, /^\s+timeout-minutes: \d+\s*$/m, 'tempo massimo del passo');
  assert.match(cf, /^\s+CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}\s*$/m);
  assert.match(cf, /^\s+CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}\s*$/m);
  const run = cf.match(/^\s+(?:run: )?npx --yes wrangler@(\S+) pages deploy _site --project-name "(\$CF_PAGES_PROGETTO|\$\{\{ vars\.CF_PAGES_PROGETTO \}\})" --branch main( --commit-dirty=true)?\s*$/m);
  assert.ok(run, 'comando: npx --yes wrangler@<versione> pages deploy _site --project-name "..." --branch main');
  if (run[2] === '$CF_PAGES_PROGETTO') assert.match(cf, /^\s+CF_PAGES_PROGETTO: \$\{\{ vars\.CF_PAGES_PROGETTO \}\}\s*$/m);
  // dalla radice del repository: wrangler prende anche functions/ (e servizi/, che le funzioni importano)
  assert.doesNotMatch(cf, /working-directory|^\s+cd\s|--cwd/m);
  // la pubblicazione su GitHub Pages resta com'era
  assert.match(y, /uses: actions\/upload-pages-artifact@v\d+\s*\n\s+with:\s*\n\s+path: _site/);
  assert.match(y, /- id: deploy\s*\n\s+uses: actions\/deploy-pages@v\d+/);
});

test('workflow: wrangler con una versione esatta (3 o 4) e Node adatto', async () => {
  const y = await leggi('.github/workflows/aggiorna-aste.yml');
  const usi = [...y.matchAll(/wrangler@(\S+)/g)].map((m) => m[1]);
  assert.ok(usi.length >= 1);
  for (const v of usi) assert.match(v, /^[34]\.\d+\.\d+$/, 'versione esatta, non "' + v + '" (niente latest, ^, ~ o x)');
  assert.doesNotMatch(y, /npx (--yes )?wrangler(\s|$)/m, 'wrangler senza versione');
  // le versioni recenti di wrangler 4 chiedono Node 22 (campo engines del pacchetto)
  const node = Number((y.match(/node-version:\s*'?(\d+)/) || [])[1]);
  assert.ok(node >= 22, 'Node ' + node + ': wrangler 4 vuole Node 22 o superiore');
  // la guida e il README indicano la stessa versione del workflow (per esempio per "pages secret put")
  for (const f of ['ABBONAMENTI.md', 'README.md', 'wrangler.toml']) {
    for (const m of (await leggi(f)).matchAll(/wrangler@(\S+?)[\s`)]/g)) assert.equal(m[1], usi[0], f + ': wrangler@' + m[1] + ' diversa dal workflow');
  }
});

test('workflow: chiavi e token solo dai secret, mai scritti nel file', async () => {
  const y = await leggi('.github/workflows/aggiorna-aste.yml');
  const righe = [...y.matchAll(/^\s+(token|[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|KEY|ACCOUNT_ID|PASSWORD)[A-Z0-9_]*):\s*(.+?)\s*$/gm)];
  assert.ok(righe.length >= 3, 'trovate le righe con le chiavi');
  for (const [, nome, valore] of righe) assert.match(valore, /^\$\{\{ secrets\.[A-Z0-9_]+ \}\}$/, nome + ' deve venire da un secret');
  for (const re of CHIAVI) assert.doesNotMatch(y, re);
});

test('workflow: "Prepara il sito" copia _headers e non pubblica funzioni, servizi, schema, guide né wrangler.toml', async () => {
  const y = await leggi('.github/workflows/aggiorna-aste.yml');
  const sito = passo(y, 'Prepara il sito');
  assert.match(sito, /^\s+cp _headers _site\/\s*$/m);
  for (const r of sito.split('\n').filter((x) => /^\s*cp\b/.test(x))) {
    assert.doesNotMatch(r, /\b(functions|servizi|supabase|scripts|tests)\b|wrangler\.toml|\.md\b|\.github/, 'non pubblicare: ' + r.trim());
  }
});

// --- wrangler.toml ---------------------------------------------------------------------------------------------------

test('wrangler.toml: progetto Pages con la cartella _site, data di compatibilità fissa, nessuna chiave', async () => {
  const t = await leggi('wrangler.toml');
  const righe = t.split('\n').filter((r) => r.trim() && !r.trim().startsWith('#'));
  const valori = {};
  for (const r of righe) { const m = r.match(/^\s*([a-z_]+)\s*=\s*"([^"]*)"\s*(#.*)?$/); if (m) valori[m[1]] = m[2]; }
  assert.match(valori.name || '', /^[a-z0-9][a-z0-9-]*$/, 'name');
  assert.equal(valori.pages_build_output_dir, '_site');
  assert.match(valori.compatibility_date || '', /^\d{4}-\d{2}-\d{2}$/, 'compatibility_date fissa (AAAA-MM-GG)');
  const data = new Date(valori.compatibility_date + 'T00:00:00Z');
  assert.ok(!isNaN(data) && data.toISOString().slice(0, 10) === valori.compatibility_date, 'data valida');
  assert.ok(data <= new Date(), 'la data di compatibilità non può essere nel futuro');
  // configurazione dei Workers, non di Pages
  assert.doesNotMatch(righe.join('\n'), /^\s*(main\s*=|\[site\])/m);
  // nessuna variabile delle funzioni: stanno nel pannello di Cloudflare, come segreti
  assert.doesNotMatch(righe.join('\n'), /^\s*\[vars\]|^\s*(STRIPE_|SUPABASE_|RESEND_|EMAIL_|SITO_URL|PAGAMENTI_REALI|ANTHROPIC_|CLOUDFLARE_)/m);
  for (const re of CHIAVI) assert.doesNotMatch(t, re);
});

// --- _headers --------------------------------------------------------------------------------------------------------

// _headers di Cloudflare Pages: riga senza rientro = percorso, righe rientrate = "Nome: valore"
function regole(testo) {
  const r = new Map();
  let attuale = null;
  for (const riga of testo.split('\n')) {
    if (!riga.trim() || riga.trim().startsWith('#')) continue;
    if (!/^\s/.test(riga)) { attuale = riga.trim(); assert.ok(!r.has(attuale), 'percorso ripetuto: ' + attuale); r.set(attuale, {}); continue; }
    assert.ok(attuale, 'intestazione senza percorso: ' + riga);
    const i = riga.indexOf(':');
    r.get(attuale)[riga.slice(0, i).trim().toLowerCase()] = riga.slice(i + 1).trim();
  }
  return r;
}

// "default-src 'self'; img-src ..." → { 'default-src': ["'self'"], 'img-src': [...] }
function direttive(csp) {
  const d = {};
  for (const parte of csp.split(';')) {
    const [nome, ...valori] = parte.trim().split(/\s+/);
    if (nome) d[nome.toLowerCase()] = valori;
  }
  return d;
}

// valori che valgono per una direttiva (con i ripieghi della CSP)
function valoriPer(d, nome) {
  if (d[nome]) return d[nome];
  if (nome === 'worker-src') return d['child-src'] || d['script-src'] || d['default-src'] || [];
  if (nome === 'frame-src') return d['child-src'] || d['default-src'] || [];
  return d['default-src'] || [];
}

// una sorgente della CSP (https://tile.openstreetmap.org, https://*.supabase.co) copre l'host?
function copre(sorgente, host) {
  if (sorgente === '*') return true;
  const m = sorgente.toLowerCase().match(/^(?:(https?|wss?):\/\/)?(\*\.)?([a-z0-9.-]+)(?::(?:\d+|\*))?(?:\/.*)?$/);
  if (!m || (m[1] && m[1] !== 'https' && m[1] !== 'wss')) return false;
  const [, , jolly, base] = m;
  if (host.startsWith('*.')) return !!jolly && (host.slice(2) === base || host.slice(2).endsWith('.' + base));
  return jolly ? host.endsWith('.' + base) : host === base;
}
const permesso = (d, nome, host) => valoriPer(d, nome).some((s) => copre(s, host));
const sorgentiHost = (valori) => valori.filter((v) => !v.startsWith("'") && !/^[a-z-]+:$/.test(v) && v !== '*');

// file che il browser carica: pagine, script, stili, configurazione, librerie e dati fissi (non quelli del giorno,
// non il codice che gira solo sul server o nella raccolta)
async function fileDelSito() {
  const lista = (await readdir(RADICE)).filter((f) => /\.(html|webmanifest)$/.test(f) || f === 'sw.js');
  for (const c of ['js', 'config', 'assets']) {
    for (const f of await readdir(path.join(RADICE, c), { recursive: true })) if (/\.(m?js|css|html|svg)$/.test(f)) lista.push(path.join(c, f));
  }
  for (const f of ['data/geo.js', 'data/italia.js']) if (await esiste(f)) lista.push(f);
  return lista.sort();
}

// contesti in cui un indirizzo viene caricato dal browser (testo subito prima dell'indirizzo) → direttive possibili
const CARICAMENTI = [
  [/\b(fetch|sendBeacon|EventSource|WebSocket)\s*\(\s*['"`]$/, ['connect-src']],
  [/\.open\(\s*['"][A-Za-z]+['"]\s*,\s*['"`]$/, ['connect-src']],
  [/\btileLayer(\.\w+)?\s*\(\s*['"`]$/, ['img-src']],
  // stile di MapLibre (Radar 3D): stile, caratteri, icone e tile si scaricano con fetch, anche le immagini raster
  [/\b(style|glyphs|sprite)\s*:\s*['"`]$/, ['connect-src']],
  [/\btiles\s*:\s*\[\s*(['"`][^'"`]*['"`]\s*,\s*)*['"`]$/, ['connect-src']],
  [/<img\b[^>]*\bsrc(set)?=\s*\\?['"][^'"]*$/i, ['img-src']],
  [/<script\b[^>]*\bsrc=\s*\\?['"]$/i, ['script-src']],
  [/<i?frame\b[^>]*\bsrc=\s*\\?['"]$/i, ['frame-src']],
  [/<(audio|video|source|track)\b[^>]*\bsrc=\s*\\?['"]$/i, ['media-src']],
  [/<(object|embed)\b[^>]*\b(data|src)=\s*\\?['"]$/i, ['object-src']],
  [/<link\b[^>]*\bhref=\s*\\?['"]$/i, ['style-src', 'font-src', 'img-src', 'manifest-src']],
  [/@import\s+(url\(\s*)?['"]?$/, ['style-src']],
  [/\burl\(\s*['"]?$/, ['img-src', 'font-src']],
  [/\b(importScripts|Worker|SharedWorker|import)\s*\(\s*['"`]$/, ['script-src', 'worker-src']],
  [/\.(src|poster)\s*=\s*['"`]$/, ['img-src', 'script-src', 'media-src']]
];
// un indirizzo messo in una variabile conta se la variabile finisce in un caricamento
const usiDiVariabile = (nome) => [
  [new RegExp('\\b(fetch|sendBeacon|EventSource|WebSocket)\\s*\\(\\s*' + nome + '\\b'), ['connect-src']],
  [new RegExp('\\.open\\(\\s*[\'"][A-Za-z]+[\'"]\\s*,\\s*' + nome + '\\b'), ['connect-src']],
  [new RegExp('\\btileLayer(\\.\\w+)?\\s*\\(\\s*' + nome + '\\b'), ['img-src']],
  [new RegExp('\\b(style|glyphs|sprite)\\s*:\\s*' + nome + '\\b'), ['connect-src']],
  [new RegExp('\\btiles\\s*:\\s*\\[[^\\]]*\\b' + nome + '\\b'), ['connect-src']],
  [new RegExp('\\b(importScripts|Worker|SharedWorker)\\s*\\(\\s*' + nome + '\\b'), ['script-src', 'worker-src']],
  [new RegExp('\\.(src|poster)\\s*=\\s*' + nome + '\\b'), ['img-src', 'script-src', 'media-src']]
];

// host "{s}.tile.esempio.org" (modelli di Leaflet) → "*.tile.esempio.org"
function normalizzaHost(h) {
  h = h.toLowerCase().replace(/\.$/, '');
  if (/[{}*]/.test(h)) h = h.replace(/^(\{[^}]*\}|\*)\./, '*.');
  return /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) ? h : null;
}

// tutte le risorse esterne caricate dal codice del sito: [{ host, direttive, dove }]
async function risorseNelCodice() {
  const trovate = [];
  for (const f of await fileDelSito()) {
    const t = await leggi(f);
    for (const m of t.matchAll(/\b(?:https?|wss?):\/\/([A-Za-z0-9{}*._-]+)/g)) {
      const host = normalizzaHost(m[1]);
      if (!host) continue;
      const prima = t.slice(Math.max(0, m.index - 300), m.index).split('\n').pop();
      for (const [re, dir] of CARICAMENTI) if (re.test(prima)) trovate.push({ host, direttive: dir, dove: f });
      const v = prima.match(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*['"`]$/);
      if (v) for (const [re, dir] of usiDiVariabile(v[1].replace(/\$/g, '\\$'))) if (re.test(t)) trovate.push({ host, direttive: dir, dove: f + ' (' + v[1] + ')' });
    }
  }
  return trovate;
}

// indirizzi che arrivano dai dati o dalla configurazione, non scritti nel codice delle pagine
async function risorseDinamiche() {
  const { RISORSE } = await import('../scripts/lib/dettaglio-pvp.mjs');
  const r = [{ host: new URL(RISORSE).hostname, direttive: ['img-src'], dove: 'foto delle aste (scripts/lib/dettaglio-pvp.mjs → data/dettagli/)' }];
  const abb = require('../config/abbonamenti.js');
  const sb = abb.supabase && abb.supabase.url;
  // senza configurazione vale l'indirizzo che Supabase dà a ogni progetto: https://<id>.supabase.co
  r.push({ host: sb ? new URL(sb).hostname : 'progetto.supabase.co', direttive: ['connect-src'], dove: 'account (config/abbonamenti.js → supabase.url)' });
  for (const [k, u] of Object.entries(abb.api || {})) if (/^https?:\/\//.test(u || '')) r.push({ host: new URL(u).hostname, direttive: ['connect-src'], dove: 'config/abbonamenti.js → api.' + k });
  const ponte = require('../config/consulente.js').ponte;
  if (/^https?:\/\//.test(ponte || '')) r.push({ host: new URL(ponte).hostname, direttive: ['connect-src'], dove: 'config/consulente.js → ponte' });
  return [...r, ...await risorsePreviste()];
}

// indirizzi già nella CSP per il Radar 3D, che è in lavorazione (MapLibre scarica sfondo, caratteri e icone con fetch).
// Finché i suoi file non esistono valgono così; quando esistono devono nominarli, altrimenti vanno tolti dalla CSP.
const PREVISTI = [
  { host: 'tiles.openfreemap.org', direttive: ['connect-src'], perche: 'Radar 3D: stile, tile vettoriali, caratteri e icone di OpenFreeMap' },
  { host: 'tile.openstreetmap.org', direttive: ['connect-src'], perche: 'Radar 3D: sfondo raster di ripiego di OpenStreetMap' }
];
async function risorsePreviste() {
  const radar3d = (await fileDelSito()).filter((f) => /radar3d/i.test(f) && !f.startsWith(path.join('assets', 'vendor')));
  const testi = await Promise.all(radar3d.map(leggi));
  return PREVISTI.filter((p) => !radar3d.length || testi.some((t) => t.includes(p.host)))
    .map((p) => ({ host: p.host, direttive: p.direttive, dove: p.perche + (radar3d.length ? '' : ' (pagina in arrivo)') }));
}

async function csp() {
  const r = regole(await leggi('_headers'));
  const tutte = r.get('/*');
  assert.ok(tutte && tutte['content-security-policy'], '_headers: manca la Content-Security-Policy per /*');
  return direttive(tutte['content-security-policy']);
}

test('_headers: intestazioni di sicurezza per tutte le pagine', async () => {
  const testo = await leggi('_headers');
  const r = regole(testo);
  const h = r.get('/*');
  assert.ok(h, 'regola per /*');
  assert.equal(h['x-content-type-options'], 'nosniff');
  assert.equal(h['x-frame-options'], 'DENY');
  // le regole d'uso delle tile e di Nominatim chiedono che il sito si faccia riconoscere: serve l'origine
  assert.ok(['strict-origin-when-cross-origin', 'strict-origin'].includes(h['referrer-policy']), 'Referrer-Policy: ' + h['referrer-policy']);
  assert.ok(h['permissions-policy'], 'Permissions-Policy');
  const d = direttive(h['content-security-policy']);
  assert.deepEqual(d['frame-ancestors'], ["'none'"]);
  assert.deepEqual(d['object-src'], ["'none'"]);
  assert.ok(d['base-uri'] && d['form-action'] && d['default-src'], 'base-uri, form-action, default-src');
  // limiti di Cloudflare Pages: 100 regole, righe fino a 2000 caratteri
  assert.ok(r.size <= 100);
  for (const riga of testo.split('\n')) assert.ok(riga.length < 2000, 'riga troppo lunga per Cloudflare');
});

test('_headers: CSP senza unsafe-eval; lo script del tema di ogni pagina autorizzato con la sua impronta', async () => {
  const d = await csp();
  for (const [nome, valori] of Object.entries(d)) assert.ok(!valori.includes("'unsafe-eval'"), nome + ": niente 'unsafe-eval'");
  const script = valoriPer(d, 'script-src');
  for (const vietato of ["'unsafe-inline'", '*', 'https:', 'http:', 'data:', 'blob:']) assert.ok(!script.includes(vietato), 'script-src: niente ' + vietato);
  const pagine = (await readdir(RADICE)).filter((f) => f.endsWith('.html'));
  assert.ok(pagine.length > 10);
  let inline = 0;
  for (const f of pagine) {
    const t = await leggi(f);
    for (const m of t.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc=/.test(m[1]) || /type=["']?application\/(ld\+)?json/i.test(m[1])) continue;
      const impronta = "'sha256-" + createHash('sha256').update(m[2], 'utf8').digest('base64') + "'";
      assert.ok(script.includes(impronta), f + ': aggiungi ' + impronta + ' a script-src in _headers');
      inline++;
    }
    // le impronte non coprono gestori scritti negli attributi né link javascript:
    assert.doesNotMatch(t, /<[a-z][^>]*\son[a-z]+\s*=/i, f + ': gestore di evento in un attributo (onclick=...)');
    assert.doesNotMatch(t, /\bhref=["']?\s*javascript:/i, f + ': link javascript:');
  }
  assert.ok(inline >= pagine.length, 'ogni pagina ha lo script del tema');
  // nemmeno nel codice che scrive l'HTML delle pagine
  for (const f of (await fileDelSito()).filter((x) => /\.js$/.test(x) && !x.startsWith(path.join('assets', 'vendor')))) {
    const t = await leggi(f);
    assert.doesNotMatch(t, /\son(click|load|error|change|input|submit|key\w+|mouse\w+|focus|blur)\s*=\s*\\?["']/, f + ': gestore di evento in un attributo');
    assert.doesNotMatch(t, /\bnew Function\s*\(|\beval\s*\(/, f + ": eval o new Function richiederebbero 'unsafe-eval'");
  }
});

test('_headers: la CSP copre ogni indirizzo esterno che il sito carica, e solo quelli', async () => {
  const d = await csp();
  const nelCodice = await risorseNelCodice();
  // il cercatore trova davvero le risorse scritte nel codice (sfondo della mappa e ricerca dei luoghi)
  assert.ok(nelCodice.some((r) => r.host === 'tile.openstreetmap.org' && r.direttive.includes('img-src')), 'tile di OpenStreetMap trovate');
  assert.ok(nelCodice.some((r) => r.host === 'nominatim.openstreetmap.org' && r.direttive.includes('connect-src')), 'Nominatim trovato');
  const tutte = [...nelCodice, ...await risorseDinamiche()];
  for (const r of tutte) {
    assert.ok(r.direttive.some((dir) => permesso(d, dir, r.host)), r.host + ' (' + r.dove + '): aggiungilo a ' + r.direttive.join(' o ') + ' in _headers');
  }
  // ogni host nella CSP serve a qualcosa
  for (const [nome, valori] of Object.entries(d)) {
    for (const s of sorgentiHost(valori)) {
      assert.ok(tutte.some((r) => r.direttive.includes(nome) && copre(s, r.host)), nome + ' ' + s + ': nessuna parte del sito lo usa, toglilo');
    }
  }
  // Stripe Checkout, il portale clienti e i documenti delle aste si aprono come pagine: non stanno nella CSP
  assert.ok(!Object.values(d).flat().some((v) => /stripe\.com/.test(v)), 'Stripe solo come navigazione');
  assert.ok(!nelCodice.some((r) => /(^|\.)stripe\.com$/.test(r.host)), 'nessuno script o richiesta verso Stripe dal browser');
});

test('_headers: cache lunga per caratteri e librerie, nessuna cache per i dati del giorno e per il service worker', async () => {
  const r = regole(await leggi('_headers'));
  const maxAge = (v) => Number(((v || '').match(/max-age=(\d+)/) || [])[1] || 0);
  for (const p of ['/assets/fonts/*', '/assets/vendor/*']) {
    assert.ok(r.get(p), 'regola per ' + p);
    assert.ok(maxAge(r.get(p)['cache-control']) >= 31536000, p + ': un anno');
  }
  for (const p of ['/data/*', '/sw.js']) {
    const v = r.get(p) && r.get(p)['cache-control'];
    assert.match(v || '', /no-cache|no-store/, p);
    assert.equal(maxAge(v), 0, p + ': nessun max-age');
  }
  // nessun'altra regola mette in cache a lungo pagine, script o configurazione; /* non tocca la cache
  assert.equal(r.get('/*')['cache-control'], undefined);
  for (const [p, h] of r) if (maxAge(h['cache-control']) > 0) assert.match(p, /^\/assets\/(fonts|vendor)\//, p + ': cache lunga solo per caratteri e librerie');
});

test('_headers: Permissions-Policy non spegne le funzioni del browser che il sito usa', async () => {
  const pp = {};
  for (const parte of regole(await leggi('_headers')).get('/*')['permissions-policy'].split(',')) {
    const [k, v] = parte.trim().split('=');
    pp[k] = v;
  }
  for (const f of ['camera', 'microphone', 'payment']) assert.equal(pp[f], '()', f + ' spento');
  // funzioni usate dal codice del sito (le librerie in assets/vendor/ ne hanno di non usate, es. la posizione di Leaflet)
  const USI = { 'web-share': /navigator\.share\b/, 'clipboard-write': /navigator\.clipboard\b/, geolocation: /navigator\.geolocation\b|\.locate\(\s*\{|GeolocateControl/,
    camera: /getUserMedia/, microphone: /getUserMedia/, fullscreen: /requestFullscreen|FullscreenControl/, payment: /new PaymentRequest/ };
  const codice = (await Promise.all((await fileDelSito()).filter((f) => /\.js$/.test(f) && !f.startsWith(path.join('assets', 'vendor'))).map(leggi))).join('\n');
  for (const [funzione, re] of Object.entries(USI)) {
    if (re.test(codice)) assert.notEqual(pp[funzione], '()', funzione + ': il sito la usa, non spegnerla in Permissions-Policy');
  }
  // Chromium (prova del 29/10/2026) scrive in console "Unrecognized feature" per queste: non servono ("web-share" è
  // già permessa al sito di norma)
  for (const f of ['bluetooth', 'web-share', 'interest-cohort']) assert.ok(!(f in pp), f + ': il browser la segnala come sconosciuta, toglila');
});

test('_headers: worker-src solo \'self\' (service worker e worker di MapLibre sono file del sito), niente blob:', async () => {
  const d = await csp();
  const w = valoriPer(d, 'worker-src');
  // sw.js si registra con worker-src: senza 'self' il sito non funziona più offline
  assert.match(await leggi('js/ui.js'), /serviceWorker\.register\(/);
  assert.deepEqual(w, ["'self'"], "worker-src: solo 'self' (un worker blob: o di un altro sito eseguirebbe codice non preso dai file del sito)");
  // il Radar 3D usa la versione "csp" di MapLibre con il worker preso dai file del sito: senza, MapLibre creerebbe
  // un worker blob:, bloccato da questa CSP (prova nel browser del 29/10/2026: nessuna violazione senza blob:)
  const html = await leggi('radar3d.html');
  assert.match(html, /<script src="assets\/vendor\/maplibre-gl\/maplibre-gl-csp\.js"><\/script>/);
  assert.doesNotMatch(html, /maplibre-gl\.js"/, 'versione normale di MapLibre (worker blob:)');
  assert.match(await leggi('js/pages/radar3d.js'), /\.setWorkerUrl\('assets\/vendor\/maplibre-gl\/maplibre-gl-csp-worker\.js'\)/);
  // nessun worker creato in memoria dal codice del sito
  for (const f of (await fileDelSito()).filter((x) => /\.js$/.test(x) && !x.startsWith(path.join('assets', 'vendor')))) {
    assert.doesNotMatch(await leggi(f), /new (Shared)?Worker\(\s*URL\.createObjectURL|createObjectURL\([^)]*\)[^;\n]*Worker/, f + ': worker blob:');
  }
});

test('_headers: se il service worker gestisse richieste verso altri siti, anche quegli indirizzi starebbero in connect-src', async () => {
  // un service worker che passa le richieste con fetch() segue connect-src, non img-src: le foto delle aste e le tile
  // si romperebbero su Cloudflare
  const sw = await leggi('sw.js');
  const soloSito = /if\s*\([^)]*new URL\(req\.url\)\.origin\s*!==\s*(self\.)?location\.origin\)\s*return\s*;/.test(sw);
  if (soloSito) return;
  const d = await csp();
  for (const s of sorgentiHost(d['img-src'] || [])) {
    const host = s.replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
    assert.ok(permesso(d, 'connect-src', host), 'sw.js gestisce richieste esterne: aggiungi ' + s + ' anche a connect-src');
  }
});

// --- guide: ABBONAMENTI.md e README --------------------------------------------------------------------------------

test('ABBONAMENTI.md: tutte le variabili d\'ambiente lette dalle funzioni, nessuna chiave vera', async () => {
  const guida = await leggi('ABBONAMENTI.md');
  const nomi = new Set();
  for (const c of ['functions', 'servizi']) {
    for (const f of await readdir(path.join(RADICE, c), { recursive: true })) {
      if (!/\.m?js$/.test(f)) continue;
      const t = await leggi(path.join(c, f));
      for (const m of t.matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g)) nomi.add(m[1]);
      for (const m of t.matchAll(/['"]((?:STRIPE|SUPABASE|RESEND|EMAIL|SITO|PAGAMENTI|ANTHROPIC|CONSULENTE)_[A-Z0-9_]+)['"]/g)) nomi.add(m[1]);
    }
  }
  assert.ok(nomi.has('STRIPE_SECRET_KEY') && nomi.has('STRIPE_PREZZO_PRO_ANNUALE') && nomi.size >= 15, 'variabili trovate nel codice: ' + [...nomi]);
  for (const n of nomi) assert.ok(guida.includes('`' + n + '`'), 'ABBONAMENTI.md: manca la variabile ' + n);
  for (const f of ['ABBONAMENTI.md', 'README.md']) for (const re of CHIAVI) assert.doesNotMatch(await leggi(f), re, f + ': sembra una chiave vera');
});

test('ABBONAMENTI.md: eventi del webhook uguali a quelli gestiti da functions/api/stripe/webhook.js', async () => {
  const codice = await leggi('functions/api/stripe/webhook.js');
  const gestiti = new Set([...codice.matchAll(/^\s+async '([a-z_.]+)'\(/gm), ...codice.matchAll(/GESTORI\['([a-z_.]+)'\]\s*=/g)].map((m) => m[1]));
  assert.ok(gestiti.size >= 6, 'eventi trovati: ' + [...gestiti]);
  const guida = await leggi('ABBONAMENTI.md');
  const riga = guida.split('\n').find((r) => /eventi:/.test(r) && /checkout\.session\.completed/.test(r));
  assert.ok(riga, 'ABBONAMENTI.md: riga con gli eventi del webhook');
  const elencati = new Set([...riga.matchAll(/`([a-z_]+\.[a-z_.]+)`/g)].map((m) => m[1]));
  assert.deepEqual([...elencati].sort(), [...gestiti].sort());
});

test('ABBONAMENTI.md: nessun "(in arrivo)" per il report PDF, che esiste; link via email nello stesso browser', async () => {
  const guida = await leggi('ABBONAMENTI.md');
  const cfg = require('../config/abbonamenti.js');
  const pdf = cfg.piani.flatMap((p) => p.vantaggi).find((v) => /PDF/.test(v));
  assert.ok(pdf && !/in arrivo/i.test(pdf), 'config: il report PDF non è "in arrivo"');
  for (const r of guida.split('\n')) if (/PDF/.test(r)) assert.doesNotMatch(r.replace(/;[^;]*\(in arrivo\)/g, ''), /PDF[^;|]*\(in arrivo\)/i, 'ABBONAMENTI.md: ' + r.trim());
  // le funzioni "(in arrivo)" della guida sono quelle della configurazione
  const inArrivo = cfg.piani.flatMap((p) => p.vantaggi).filter((v) => /\(in arrivo\)/.test(v));
  assert.equal(inArrivo.length, 3, 'avvisi, consulente AI, statistiche avanzate');
  assert.match(guida, /stesso browser/);
  assert.match(guida, /PKCE/);
});
