// Traduttore del sito.
// Ordine di ricerca di un testo nella lingua L:
//   1. correzione dell'amministratore (tabella translation_overrides, se il database è collegato)
//   2. traduzione a mano (locales/ui|content/L.json) se il testo italiano non è cambiato da allora
//   3. traduzione automatica (auto/L.json, creata da `npm run translate`)
//   4. inglese, poi italiano
import { marked } from 'marked';
import { safeHtml } from '~/lib/safe-html';
import { flatten, hash, splitBlocks, SPECS } from './core.mjs';
import { MAIN_CODES, SOURCE_LANG, describe } from './languages.mjs';
import { pathFor } from './routes.mjs';
import itUiNested from './locales/ui/it.json';
import autoIndex from './auto/_index.json';
import { loadOverrides } from './overrides';

type Dict = Record<string, string>;
type Vars = Record<string, string | number>;

const IT_UI: Dict = flatten(itUiNested);

const uiFiles = import.meta.glob<Record<string, unknown>>('./locales/ui/*.json', { import: 'default' });
const contentFiles = import.meta.glob<Dict>('./locales/content/*.json', { import: 'default' });
const lockFiles = import.meta.glob<Dict>('./locales/lock/*.json', { import: 'default' });
const autoFiles = import.meta.glob<Dict>('./auto/[a-z]*.json', { import: 'default' });

/** Lingue pubblicate: le 16 principali + quelle automatiche complete. */
export const LANGS: string[] = [
  ...MAIN_CODES,
  ...((autoIndex as { complete?: string[] }).complete ?? []).filter((c) => !MAIN_CODES.includes(c)),
];

export const LANG_INFO = Object.fromEntries(LANGS.map((code) => [code, describe(code)]));

export function isLang(code: string | undefined): code is string {
  return !!code && LANGS.includes(code);
}

interface Pack {
  human: Dict;
  lock: Dict;
  auto: Dict;
  overrides?: Dict;
}

const packs = new Map<string, Promise<Pack>>();

async function loadPack(lang: string): Promise<Pack> {
  const get = async <T>(files: Record<string, () => Promise<T>>, path: string, fallback: T) =>
    files[path] ? await files[path]() : fallback;
  const ui = await get(uiFiles, `./locales/ui/${lang}.json`, {} as Record<string, unknown>);
  const content = await get(contentFiles, `./locales/content/${lang}.json`, {} as Dict);
  const lock = await get(lockFiles, `./locales/lock/${lang}.json`, {} as Dict);
  const auto = await get(autoFiles, `./auto/${lang}.json`, {} as Dict);
  return { human: { ...flatten(ui), ...content }, lock, auto };
}

function pack(lang: string) {
  if (!packs.has(lang)) packs.set(lang, loadPack(lang));
  return packs.get(lang)!;
}

function lookup(p: Pack, lang: string, key: string, src: string): string | undefined {
  if (p.overrides?.[key] != null) return p.overrides[key];
  if (lang === SOURCE_LANG) return src;
  const h = hash(src);
  const human = p.human[key];
  // Le traduzioni a mano senza impronta (lock) valgono finché non esiste un controllo: vedi TRANSLATIONS.md
  if (human != null && (p.lock[key] == null || p.lock[key] === h)) return human;
  if (p.auto[h] != null) return p.auto[h];
  return undefined;
}

function interpolate(s: string, vars?: Vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

export function renderMd(block: string) {
  const b = block.trim();
  // i blocchi possono arrivare dalle correzioni fatte nel pannello: sempre filtrati
  if (b.startsWith('<')) return safeHtml(b);
  return safeHtml(marked.parse(b, { async: false }) as string);
}

export type Translator = Awaited<ReturnType<typeof getTranslator>>;

export async function getTranslator(lang: string) {
  const info = LANG_INFO[lang] ?? describe(lang);
  const chain = [lang, ...(lang === 'en' || lang === SOURCE_LANG ? [] : ['en'])];
  // le correzioni dell'amministratore si rileggono a ogni richiesta (con cache breve), i file no
  const loaded = await Promise.all(chain.map(async (l) => ({ ...(await pack(l)), overrides: await loadOverrides(l) })));
  const itPack = { ...(await pack(SOURCE_LANG)), overrides: await loadOverrides(SOURCE_LANG) };

  const resolveText = (key: string, src: string) => {
    for (let i = 0; i < chain.length; i++) {
      const v = lookup(loaded[i], chain[i], key, src);
      if (v != null) return v;
    }
    return itPack.overrides?.[key] ?? src;
  };

  const plural = new Intl.PluralRules(info.intl);

  /** Testo dell'interfaccia (locales/ui). Con `count` sceglie la forma plurale giusta. */
  function t(key: string, vars?: Vars): string {
    let k = key;
    if (vars && typeof vars.count === 'number' && IT_UI[key] == null) {
      const cat = plural.select(vars.count);
      // la lingua di destinazione può avere forme che l'italiano non ha (few, many, two, zero)
      const own = loaded[0].overrides?.[`${key}.${cat}`] ?? loaded[0].human[`${key}.${cat}`];
      if (own != null && lang !== SOURCE_LANG && IT_UI[`${key}.${cat}`] == null) return interpolate(own, vars);
      k = IT_UI[`${key}.${cat}`] != null ? `${key}.${cat}` : `${key}.other`;
    }
    const src = IT_UI[k];
    if (src == null) {
      if (import.meta.env.DEV) console.warn(`[i18n] chiave mancante: ${key}`);
      return key;
    }
    return interpolate(resolveText(k, src), vars);
  }

  /** Testo di un contenuto (Keystatic) con la sua chiave e il testo italiano. */
  function c(key: string, src: string): string {
    return resolveText(key, src);
  }

  /** Traduce tutti i campi traducibili di un contenuto; i campi Markdown diventano HTML. */
  function localize<T extends Record<string, unknown>>(collection: keyof typeof SPECS, id: string, data: T): T {
    const copy = structuredClone(data) as Record<string, unknown>;
    const spec = SPECS[collection] as Record<string, unknown>;
    for (const [field, sub] of Object.entries(spec)) {
      if (!(field in copy)) continue;
      const base = `${collection}/${id}/${field}`;
      if (sub === 'md') {
        const blocks = splitBlocks(String(copy[field] ?? ''));
        copy[field] = blocks.map((b, i) => renderMd(resolveText(`${base}.${i}`, b))).join('\n');
      } else {
        copy[field] = translateDeep(sub, copy[field], base);
      }
    }
    return copy as T;
  }

  function translateDeep(spec: unknown, data: unknown, key: string): unknown {
    if (spec === 't') return typeof data === 'string' && data.trim() ? resolveText(key, data) : data;
    if (spec === 'md') return splitBlocks(String(data ?? '')).map((b, i) => renderMd(resolveText(`${key}.${i}`, b))).join('\n');
    if (Array.isArray(spec)) return Array.isArray(data) ? data.map((item, i) => translateDeep(spec[0], item, `${key}.${i}`)) : data;
    if (spec && typeof spec === 'object' && data && typeof data === 'object') {
      const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
      for (const [f, s] of Object.entries(spec)) if (f in out) out[f] = translateDeep(s, out[f], `${key}/${f}`);
      return out;
    }
    return data;
  }

  const dateFmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(info.intl, opts);
  const fmt = {
    date: (d: Date | string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'long' }) =>
      dateFmt({ timeZone: 'Europe/Rome', ...opts }).format(typeof d === 'string' ? new Date(d) : d),
    number: (n: number, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat(info.intl, opts).format(n),
    price: (eur: number) =>
      new Intl.NumberFormat(info.intl, { style: 'currency', currency: 'EUR', maximumFractionDigits: eur % 1 ? 2 : 0 }).format(eur),
    list: (items: string[]) => new Intl.ListFormat(info.intl, { type: 'conjunction' }).format(items),
  };

  return {
    lang,
    info,
    dir: info.dir as 'ltr' | 'rtl',
    t,
    c,
    localize,
    fmt,
    href: (key: string, param?: string) => pathFor(lang, key, param),
  };
}
