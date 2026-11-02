#!/usr/bin/env node
// Traduzione automatica con Google Cloud Translation (API v2, chiave API).
//
//   npm run translate                 -> traduce ciò che manca nelle 16 lingue principali
//   TRANSLATE_EXTRA=all npm run translate      -> aggiunge tutte le altre lingue di Google
//   TRANSLATE_EXTRA=sv,da,el npm run translate -> aggiunge solo queste
//   TRANSLATE_DRY_RUN=1 npm run translate      -> mostra quanti caratteri servirebbero, senza chiamare Google
//
// Come funziona
// - Si traduce sempre dall'italiano. Ogni traduzione è salvata in src/i18n/auto/<lingua>.json sotto
//   l'impronta (hash) del testo italiano: se il testo italiano cambia, la vecchia traduzione non viene
//   più usata e alla prossima esecuzione si ritraduce solo quel testo.
// - Nelle 16 lingue principali si traducono solo i testi senza traduzione a mano valida: le traduzioni
//   a mano (src/i18n/locales) e le correzioni dal pannello hanno sempre la precedenza.
// - Nomi del marchio, nomi dei marmi, segnaposto come {count} e [PREZZO], email e indirizzi web
//   non vengono tradotti.
// - Una lingua in più viene pubblicata sul sito solo quando è completa (src/i18n/auto/_index.json).
// - Senza GOOGLE_TRANSLATE_API_KEY lo script non fa nulla e la build continua: i testi mancanti
//   compaiono in inglese.
// - TRANSLATE_BUDGET_CHARS (predefinito 2.000.000) limita i caratteri inviati in una esecuzione.

import { writeFileSync, mkdirSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';
import { hash } from '../src/i18n/core.mjs';
import { GOOGLE_FALLBACK_CODES, MAIN_LANGS, SOURCE_LANG, urlCodeFromGoogle } from '../src/i18n/languages.mjs';
import { autoDir, human, localesDir, readJson, root, sourceEntries } from './i18n-source.mjs';

// .env locale (se c'è), senza dipendenze
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const KEY = process.env.GOOGLE_TRANSLATE_API_KEY ?? '';
const DRY = process.env.TRANSLATE_DRY_RUN === '1';
const BUDGET = Number(process.env.TRANSLATE_BUDGET_CHARS ?? 2_000_000);
const EXTRA = (process.env.TRANSLATE_EXTRA ?? '').trim();
// TRANSLATE_LANGS=de,fr limita le lingue principali da tradurre; TRANSLATE_OUT_DIR serve per i test
const ONLY = (process.env.TRANSLATE_LANGS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = process.env.TRANSLATE_OUT_DIR ?? autoDir;
// TRANSLATE_API_URL serve solo per i test (un finto Google in locale)
const API = process.env.TRANSLATE_API_URL ?? 'https://translation.googleapis.com/language/translate/v2';

// Termini da lasciare così come sono in tutte le lingue
const KEEP = [
  'WHITE CARRARA',
  'From Carrara to the World.',
  'Digital Showroom',
  'Marble Matching AI',
  'Marble Matching',
  'Marble Concierge',
  'Experience Carrara',
  'Italian Tours',
  'Quarry Tours',
  'Marble Workshops',
  'Food & Wine',
  'Bianco Carrara',
  'Statuario',
  'Calacatta',
  'Arabescato',
  'Bardiglio',
  'Lardo di Colonnata',
  'WhatsApp',
  'Instagram',
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

const PROTECT = new RegExp(
  [
    '\\{\\w+\\}', // variabili {count}
    '\\[[A-Z0-9 _À-Ú—–-]+\\]', // segnaposto [PREZZO], [RAGIONE SOCIALE — DA INSERIRE]
    '[\\w.+-]+@[\\w-]+\\.[\\w.-]+', // email
    'https?://[^\\s<"]+', // indirizzi web
    '\\+?\\d[\\d ]{6,}\\d', // numeri di telefono
    ...KEEP.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  ].join('|'),
  'g',
);

/** Testo italiano -> HTML da mandare a Google, con le parti da non tradurre protette. */
function toHtml(text, kind) {
  const protect = (s) => s.replace(PROTECT, (m) => `<span translate="no">${m}</span>`);
  if (kind === 'md') {
    const html = text.trim().startsWith('<') ? text : marked.parse(text, { async: false });
    // protegge solo i testi fuori dai tag
    return html.replace(/>([^<]+)</g, (m, t) => `>${protect(t)}<`).replace(/^([^<]+)/, (m) => protect(m));
  }
  return protect(esc(text));
}

/** Risposta di Google -> testo pronto per il sito. */
function fromHtml(html, kind) {
  let s = html.replace(/<span translate="no">([\s\S]*?)<\/span>/g, '$1');
  if (kind === 'md') return s.trim();
  s = s.replace(/<[^>]+>/g, '');
  return decode(s).trim();
}

async function googleLanguages() {
  try {
    const res = await fetch(`${API}/languages?key=${encodeURIComponent(KEY)}`);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return data.data.languages.map((l) => l.language);
  } catch {
    return GOOGLE_FALLBACK_CODES;
  }
}

async function translateBatch(htmls, target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}?key=${encodeURIComponent(KEY)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: htmls, source: SOURCE_LANG, target, format: 'html' }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.data.translations.map((t) => t.translatedText);
    }
    const body = await res.text();
    if (res.status === 403 || res.status === 400) throw new Error(`Google ha rifiutato la richiesta (${res.status}): ${body.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  throw new Error('Google non risponde: riprovare più tardi');
}

/** Gruppi da al massimo 100 testi e circa 4.500 caratteri. */
function batches(items) {
  const out = [];
  let cur = [];
  let size = 0;
  for (const it of items) {
    if (cur.length && (cur.length >= 100 || size + it.html.length > 4500)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(it);
    size += it.html.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function main() {
  if (!KEY && !DRY) {
    console.log('translate: GOOGLE_TRANSLATE_API_KEY non impostata, nessuna traduzione automatica (i testi mancanti restano in inglese).');
    return;
  }
  const src = sourceEntries();
  const mainTargets = MAIN_LANGS.filter((l) => l.code !== SOURCE_LANG && (!ONLY.length || ONLY.includes(l.code))).map((l) => ({ code: l.code, google: l.google, main: true }));
  let extraTargets = [];
  if (EXTRA) {
    const available = EXTRA === 'all' ? await googleLanguages() : EXTRA.split(',').map((s) => s.trim()).filter(Boolean);
    const mainCodes = new Set(MAIN_LANGS.map((l) => l.code));
    extraTargets = available
      .filter((g) => !mainCodes.has(urlCodeFromGoogle(g)) && g !== 'zh' && urlCodeFromGoogle(g) !== SOURCE_LANG)
      .map((g) => ({ code: urlCodeFromGoogle(g), google: g, main: false }));
  }

  mkdirSync(OUT, { recursive: true });
  let spent = 0;
  let stoppedForBudget = false;
  const summary = [];
  for (const t of [...mainTargets, ...extraTargets]) {
    const file = join(OUT, `${t.code}.json`);
    const prev = readJson(file);
    const h = t.main ? human(t.code) : {};
    const lock = t.main ? readJson(join(localesDir, `lock/${t.code}.json`)) : {};
    const next = {};
    const todo = [];
    for (const [key, { text, kind }] of Object.entries(src)) {
      const id = hash(text);
      const hasHuman = h[key] != null && (lock[key] == null || lock[key] === id);
      if (hasHuman) continue;
      if (prev[id] != null) next[id] = prev[id];
      else if (!todo.some((x) => x.id === id)) todo.push({ id, kind, html: toHtml(text, kind) });
    }
    const chars = todo.reduce((s, x) => s + x.html.length, 0);
    if (DRY) {
      summary.push(`${t.code}: ${todo.length} testi, ${chars} caratteri`);
      continue;
    }
    if (spent + chars > BUDGET) {
      stoppedForBudget = true;
      summary.push(`${t.code}: saltata (budget di ${BUDGET} caratteri raggiunto)`);
      writeFileSync(file, JSON.stringify(sortKeys(next), null, 0) + '\n');
      continue;
    }
    for (const group of batches(todo)) {
      const out = await translateBatch(group.map((x) => x.html), t.google);
      group.forEach((x, i) => (next[x.id] = fromHtml(out[i], x.kind)));
      spent += group.reduce((s, x) => s + x.html.length, 0);
    }
    writeFileSync(file, JSON.stringify(sortKeys(next), null, 0) + '\n');
    summary.push(`${t.code}: ${todo.length} testi tradotti (${chars} caratteri)`);
  }

  // lingue in più complete -> pubblicate
  const allIds = new Set(Object.values(src).map((v) => hash(v.text)));
  const complete = readdirSync(OUT)
    .filter((f) => /^[a-z][a-z0-9-]*\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ''))
    .filter((code) => !MAIN_LANGS.some((l) => l.code === code))
    .filter((code) => {
      const d = readJson(join(OUT, `${code}.json`));
      for (const id of allIds) if (d[id] == null) return false;
      return true;
    })
    .sort();
  if (!DRY) {
    writeFileSync(
      join(OUT, '_index.json'),
      JSON.stringify({ complete, note: 'Generato da npm run translate: lingue automatiche complete e pubblicate.' }, null, 1) + '\n',
    );
  }
  console.log(summary.join('\n'));
  console.log(DRY ? 'Prova senza invio: nessun file modificato.' : `Caratteri inviati a Google: ${spent}. Lingue in più pubblicate: ${complete.length}.`);
  if (stoppedForBudget) console.log('Alcune lingue sono state saltate per il limite di spesa: aumentare TRANSLATE_BUDGET_CHARS e rilanciare.');
}

const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

main().catch((e) => {
  console.error(`translate: ${e.message}`);
  // la build non si ferma: si pubblica con le traduzioni già presenti
  process.exit(process.env.TRANSLATE_STRICT === '1' ? 1 : 0);
});
