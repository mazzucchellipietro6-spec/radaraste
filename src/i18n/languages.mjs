// Elenco delle lingue del sito.
// Le 16 lingue "principali" sono tradotte a mano (cartella locales/).
// Tutte le altre arrivano dallo script `npm run translate` (Google Cloud Translation)
// e vengono pubblicate solo quando la loro traduzione è completa (auto/_index.json).

export const SOURCE_LANG = 'it';

/** Lingue tradotte a mano, nell'ordine in cui compaiono nel selettore. */
export const MAIN_LANGS = [
  { code: 'it', name: 'Italiano', english: 'Italian', hreflang: 'it', intl: 'it-IT', google: 'it' },
  { code: 'en', name: 'English', english: 'English', hreflang: 'en', intl: 'en-GB', google: 'en' },
  { code: 'de', name: 'Deutsch', english: 'German', hreflang: 'de', intl: 'de-DE', google: 'de' },
  { code: 'fr', name: 'Français', english: 'French', hreflang: 'fr', intl: 'fr-FR', google: 'fr' },
  { code: 'es', name: 'Español', english: 'Spanish', hreflang: 'es', intl: 'es-ES', google: 'es' },
  { code: 'pt', name: 'Português', english: 'Portuguese', hreflang: 'pt', intl: 'pt-BR', google: 'pt' },
  { code: 'nl', name: 'Nederlands', english: 'Dutch', hreflang: 'nl', intl: 'nl-NL', google: 'nl' },
  { code: 'pl', name: 'Polski', english: 'Polish', hreflang: 'pl', intl: 'pl-PL', google: 'pl' },
  { code: 'ru', name: 'Русский', english: 'Russian', hreflang: 'ru', intl: 'ru-RU', google: 'ru' },
  { code: 'zh', name: '简体中文', english: 'Chinese (Simplified)', hreflang: 'zh-Hans', intl: 'zh-CN', google: 'zh-CN' },
  { code: 'ja', name: '日本語', english: 'Japanese', hreflang: 'ja', intl: 'ja-JP', google: 'ja' },
  { code: 'ko', name: '한국어', english: 'Korean', hreflang: 'ko', intl: 'ko-KR', google: 'ko' },
  { code: 'ar', name: 'العربية', english: 'Arabic', hreflang: 'ar', intl: 'ar', google: 'ar' },
  { code: 'he', name: 'עברית', english: 'Hebrew', hreflang: 'he', intl: 'he-IL', google: 'he' },
  { code: 'tr', name: 'Türkçe', english: 'Turkish', hreflang: 'tr', intl: 'tr-TR', google: 'tr' },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi', hreflang: 'hi', intl: 'hi-IN', google: 'hi' },
];

export const MAIN_CODES = MAIN_LANGS.map((l) => l.code);

/**
 * Lingue supportate da Google Cloud Translation (elenco di riserva, usato solo se lo script
 * non può chiedere l'elenco aggiornato all'API). Codici nel formato di Google.
 */
export const GOOGLE_FALLBACK_CODES = [
  'af', 'ak', 'am', 'ar', 'as', 'ay', 'az', 'be', 'bg', 'bho', 'bm', 'bn', 'bs', 'ca', 'ceb', 'ckb', 'co', 'cs',
  'cy', 'da', 'de', 'doi', 'dv', 'ee', 'el', 'en', 'eo', 'es', 'et', 'eu', 'fa', 'fi', 'fr', 'fy', 'ga', 'gd',
  'gl', 'gn', 'gom', 'gu', 'ha', 'haw', 'he', 'hi', 'hmn', 'hr', 'ht', 'hu', 'hy', 'id', 'ig', 'ilo', 'is', 'it',
  'ja', 'jv', 'ka', 'kk', 'km', 'kn', 'ko', 'kri', 'ku', 'ky', 'la', 'lb', 'lg', 'ln', 'lo', 'lt', 'lus', 'lv',
  'mai', 'mg', 'mi', 'mk', 'ml', 'mn', 'mni-Mtei', 'mr', 'ms', 'mt', 'my', 'ne', 'nl', 'no', 'nso', 'ny', 'om',
  'or', 'pa', 'pl', 'ps', 'pt', 'pt-PT', 'qu', 'ro', 'ru', 'rw', 'sa', 'sd', 'si', 'sk', 'sl', 'sm', 'sn', 'so',
  'sq', 'sr', 'st', 'su', 'sv', 'sw', 'ta', 'te', 'tg', 'th', 'ti', 'tk', 'tl', 'tr', 'ts', 'tt', 'ug', 'uk',
  'ur', 'uz', 'vi', 'xh', 'yi', 'yo', 'zh-CN', 'zh-TW', 'zu',
];

const GOOGLE_ALIASES = { iw: 'he', jw: 'jv', 'zh-CN': 'zh', zh: 'zh', fil: 'tl' };
const HREFLANG_OVERRIDES = { 'zh-tw': 'zh-Hant', zh: 'zh-Hans' };
const INTL_OVERRIDES = { 'zh-tw': 'zh-TW', 'mni-mtei': 'mni', 'pt-pt': 'pt-PT' };

/** Codice usato nell'URL a partire dal codice di Google (sempre minuscolo). */
export function urlCodeFromGoogle(googleCode) {
  return (GOOGLE_ALIASES[googleCode] ?? googleCode).toLowerCase();
}

const RTL_CODES = new Set(['ar', 'he', 'iw', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb', 'syr', 'fa-af', 'pa-arab', 'ms-arab', 'bal', 'prs', 'pnb', 'ks']);

function canonicalTag(code) {
  // 'pt-pt' -> 'pt-PT', 'mni-mtei' -> 'mni-Mtei', 'zh-tw' -> 'zh-TW'
  const [base, ...rest] = code.split('-');
  return [base, ...rest.map((p) => (p.length === 4 ? p[0].toUpperCase() + p.slice(1) : p.toUpperCase()))].join('-');
}

function safeLocale(tag) {
  try {
    return new Intl.Locale(tag);
  } catch {
    return null;
  }
}

/** Direzione del testo: 'rtl' per arabo, ebraico, persiano, urdu e simili. */
export function dirOf(code) {
  if (RTL_CODES.has(code)) return 'rtl';
  const loc = safeLocale(canonicalTag(code));
  const info = loc && (typeof loc.getTextInfo === 'function' ? loc.getTextInfo() : loc.textInfo);
  return info?.direction === 'rtl' ? 'rtl' : 'ltr';
}

/** Sistema di scrittura (es. Latn, Cyrl, Arab, Jpan) per scegliere i font Noto giusti. */
export function scriptOf(code) {
  if (code === 'ja') return 'Jpan';
  if (code === 'ko') return 'Kore';
  if (code === 'zh') return 'Hans';
  if (code === 'zh-tw') return 'Hant';
  const loc = safeLocale(canonicalTag(code));
  try {
    return loc?.maximize().script ?? 'Latn';
  } catch {
    return 'Latn';
  }
}

function capitalize(s, tag) {
  if (!s) return s;
  try {
    return s.charAt(0).toLocaleUpperCase(tag) + s.slice(1);
  } catch {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}

/** Nome della lingua scritto nella lingua stessa (autonimo). */
export function nativeName(code, fallback) {
  const main = MAIN_LANGS.find((l) => l.code === code);
  if (main) return main.name;
  const tag = INTL_OVERRIDES[code] ?? canonicalTag(code);
  try {
    const name = new Intl.DisplayNames([tag], { type: 'language', fallback: 'none' }).of(tag);
    if (name && name.toLowerCase() !== tag.toLowerCase()) return capitalize(name, tag);
  } catch {
    /* lingua sconosciuta a ICU */
  }
  return fallback || englishName(code) || code;
}

export function englishName(code) {
  const main = MAIN_LANGS.find((l) => l.code === code);
  if (main) return main.english;
  const tag = INTL_OVERRIDES[code] ?? canonicalTag(code);
  try {
    return new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(tag) || code;
  } catch {
    return code;
  }
}

/** Nome della lingua `code` scritto nella lingua `inLang` (per la ricerca nel selettore). */
export function nameIn(code, inLang) {
  const tag = INTL_OVERRIDES[code] ?? canonicalTag(code);
  const inTag = INTL_OVERRIDES[inLang] ?? canonicalTag(inLang);
  try {
    return new Intl.DisplayNames([inTag], { type: 'language', fallback: 'none' }).of(tag) || '';
  } catch {
    return '';
  }
}

/** Descrizione completa di una lingua pubblicata. */
export function describe(code, extra = {}) {
  const main = MAIN_LANGS.find((l) => l.code === code);
  if (main) return { ...main, dir: dirOf(code), script: scriptOf(code), main: true };
  return {
    code,
    name: nativeName(code, extra.name),
    english: englishName(code),
    hreflang: HREFLANG_OVERRIDES[code] ?? canonicalTag(code),
    intl: INTL_OVERRIDES[code] ?? canonicalTag(code),
    google: extra.google ?? code,
    dir: dirOf(code),
    script: scriptOf(code),
    main: false,
  };
}
