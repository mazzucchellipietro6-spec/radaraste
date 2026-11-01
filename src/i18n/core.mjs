// Funzioni condivise tra il sito (build) e lo script di traduzione (Node).
// Nessuna dipendenza da Astro: deve funzionare anche in `node scripts/translate.mjs`.

/** Impronta breve e stabile di un testo (cyrb53), usata per capire quando un testo cambia. */
export function hash(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** { a: { b: 'x' } } -> { 'a.b': 'x' } */
export function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else if (typeof v === 'string') out[key] = v;
  }
  return out;
}

/** Divide un testo Markdown in blocchi (paragrafi, titoli, elenchi) separati da righe vuote. */
export function splitBlocks(md) {
  return String(md ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * Quali campi dei contenuti (Keystatic) vanno tradotti.
 *   't'  = testo semplice
 *   'md' = testo lungo in Markdown, tradotto paragrafo per paragrafo
 *   [spec] = elenco di elementi con la stessa struttura
 */
export const SPECS = {
  marbles: {
    tagline: 't',
    description: 'md',
    visualNotes: 'md',
    slabAlt: 't',
    detailAlt: 't',
    ambientAlt: 't',
    gallery: [{ alt: 't' }],
    techSheets: [{ title: 't' }],
    seoTitle: 't',
    seoDescription: 't',
  },
  experiences: {
    title: 't',
    summary: 't',
    description: 'md',
    highlights: ['t'],
    duration: 't',
    meetingPoint: 't',
    priceNote: 't',
    imageAlt: 't',
    seoTitle: 't',
    seoDescription: 't',
  },
  destinations: {
    name: 't',
    tagline: 't',
    description: 'md',
    attractions: ['t'],
    experiences: ['t'],
    itineraries: [{ title: 't', text: 't' }],
    imageAlt: 't',
    seoTitle: 't',
    seoDescription: 't',
  },
  projects: {
    title: 't',
    location: 't',
    summary: 't',
    description: 'md',
    gallery: [{ alt: 't' }],
  },
  glossary: {
    term: 't',
    definition: 't',
  },
  legal: {
    title: 't',
    body: 'md',
  },
};

/** Visita ogni testo traducibile di un contenuto: cb(chiave, testo, tipo). */
export function walk(spec, data, prefix, cb) {
  if (spec === 't') {
    if (typeof data === 'string' && data.trim()) cb(prefix, data, 't');
    return;
  }
  if (spec === 'md') {
    splitBlocks(data).forEach((block, i) => cb(`${prefix}.${i}`, block, 'md'));
    return;
  }
  if (Array.isArray(spec)) {
    (Array.isArray(data) ? data : []).forEach((item, i) => walk(spec[0], item, `${prefix}.${i}`, cb));
    return;
  }
  for (const [field, sub] of Object.entries(spec)) {
    if (data && field in data) walk(sub, data[field], `${prefix}/${field}`.replace(/^\//, ''), cb);
  }
}

/** Tutti i testi traducibili di un contenuto: [{ key, text, kind }]. */
export function collectEntry(collection, id, data) {
  const out = [];
  walk(SPECS[collection], data, `${collection}/${id}`, (key, text, kind) => out.push({ key, text, kind }));
  return out;
}
