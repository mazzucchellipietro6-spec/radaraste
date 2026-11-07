// Percorsi localizzati. Le lingue con alfabeto latino hanno parole proprie nell'URL;
// le altre (russo, cinese, giapponese, arabo, ...) usano i percorsi inglesi, più leggibili quando si condividono.
// Esempio: /it/marmi/statuario/  /de/marmor/statuario/  /ja/marbles/statuario/

const S = {
  marbles: { it: 'marmi', en: 'marbles', de: 'marmor', fr: 'marbres', es: 'marmoles', pt: 'marmores', nl: 'marmer', pl: 'marmury', tr: 'mermerler' },
  showroom: { it: 'showroom-digitale', en: 'digital-showroom', de: 'digitaler-showroom', fr: 'showroom-digital', es: 'showroom-digital', pt: 'showroom-digital', nl: 'digitale-showroom', pl: 'cyfrowy-showroom', tr: 'dijital-showroom' },
  matching: { it: 'riconoscimento-marmo', en: 'marble-matching', de: 'marmor-erkennung', fr: 'reconnaissance-marbre', es: 'reconocimiento-marmol', pt: 'reconhecimento-marmore', nl: 'marmer-herkenning', pl: 'rozpoznawanie-marmuru', tr: 'mermer-eslestirme' },
  concierge: { it: 'consulente-marmo', en: 'marble-concierge', de: 'marmor-concierge', fr: 'concierge-marbre', es: 'concierge-marmol', pt: 'concierge-marmore', nl: 'marmer-concierge', pl: 'konsjerz-marmuru', tr: 'mermer-danismani' },
  experience: { it: 'esperienze-carrara', en: 'experience-carrara', de: 'carrara-erleben', fr: 'experiences-carrara', es: 'experiencias-carrara', pt: 'experiencias-carrara', nl: 'carrara-beleven', pl: 'carrara-doswiadczenia', tr: 'carrara-deneyimleri' },
  tours: { it: 'tour-italia', en: 'italian-tours', de: 'italien-reisen', fr: 'voyages-italie', es: 'tours-italia', pt: 'tours-italia', nl: 'italie-reizen', pl: 'wycieczki-wlochy', tr: 'italya-turlari' },
  customTrip: { it: 'viaggio-su-misura', en: 'tailor-made-trip', de: 'massgeschneiderte-reise', fr: 'voyage-sur-mesure', es: 'viaje-a-medida', pt: 'viagem-sob-medida', nl: 'reis-op-maat', pl: 'podroz-na-zamowienie', tr: 'kisiye-ozel-seyahat' },
  booking: { it: 'prenota', en: 'book', de: 'buchen', fr: 'reserver', es: 'reservar', pt: 'reservar', nl: 'boeken', pl: 'rezerwacja', tr: 'rezervasyon' },
  projects: { it: 'progetti', en: 'projects', de: 'projekte', fr: 'projets', es: 'proyectos', pt: 'projetos', nl: 'projecten', pl: 'projekty', tr: 'projeler' },
  trade: { it: 'commercio-internazionale', en: 'international-trade', de: 'internationaler-handel', fr: 'commerce-international', es: 'comercio-internacional', pt: 'comercio-internacional', nl: 'internationale-handel', pl: 'handel-miedzynarodowy', tr: 'uluslararasi-ticaret' },
  about: { it: 'chi-siamo', en: 'about', de: 'ueber-uns', fr: 'a-propos', es: 'quienes-somos', pt: 'sobre-nos', nl: 'over-ons', pl: 'o-nas', tr: 'hakkimizda' },
  contact: { it: 'contatti', en: 'contact', de: 'kontakt', fr: 'contact', es: 'contacto', pt: 'contato', nl: 'contact', pl: 'kontakt', tr: 'iletisim' },
  quote: { it: 'richiedi-preventivo', en: 'request-a-quote', de: 'angebot-anfordern', fr: 'demande-de-devis', es: 'solicitar-presupuesto', pt: 'solicitar-orcamento', nl: 'offerte-aanvragen', pl: 'zapytanie-ofertowe', tr: 'teklif-iste' },
  selection: { it: 'la-mia-selezione', en: 'my-selection', de: 'meine-auswahl', fr: 'ma-selection', es: 'mi-seleccion', pt: 'minha-selecao', nl: 'mijn-selectie', pl: 'moj-wybor', tr: 'secimim' },
  glossary: { it: 'glossario-marmo', en: 'marble-glossary', de: 'marmor-glossar', fr: 'glossaire-marbre', es: 'glosario-marmol', pt: 'glossario-marmore', nl: 'marmer-woordenlijst', pl: 'slownik-marmuru', tr: 'mermer-sozlugu' },
  b2b: { en: 'b2b' },
  privacy: { it: 'privacy', en: 'privacy-policy', de: 'datenschutz', fr: 'confidentialite', es: 'privacidad', pt: 'privacidade', nl: 'privacy', pl: 'prywatnosc', tr: 'gizlilik' },
  cookies: { it: 'cookie', en: 'cookie-policy', de: 'cookie-richtlinie', fr: 'cookies', es: 'cookies', pt: 'cookies', nl: 'cookiebeleid', pl: 'pliki-cookie', tr: 'cerezler' },
  terms: { it: 'termini-e-condizioni', en: 'terms', de: 'agb', fr: 'conditions-generales', es: 'condiciones', pt: 'termos', nl: 'voorwaarden', pl: 'regulamin', tr: 'kosullar' },
  legalNotice: { it: 'note-legali', en: 'legal-notice', de: 'impressum', fr: 'mentions-legales', es: 'aviso-legal', pt: 'aviso-legal', nl: 'colofon', pl: 'nota-prawna', tr: 'yasal-uyari' },
};

/** Pagine con un elemento (slug) sotto la sezione. */
export const ITEM_PARENT = { marble: 'marbles', experienceItem: 'experience', destination: 'tours' };

export const PAGE_KEYS = ['home', ...Object.keys(S)];

/** Segmento URL di una sezione nella lingua indicata. */
export function segment(lang, key) {
  const map = S[key];
  if (!map) throw new Error(`Percorso sconosciuto: ${key}`);
  return map[lang] ?? map.en;
}

/** Percorso completo di una pagina. `param` è lo slug dell'elemento per marble/experienceItem/destination. */
export function pathFor(lang, key, param) {
  if (key === 'home') return `/${lang}/`;
  if (key === 'customTrip') return `/${lang}/${segment(lang, 'tours')}/${segment(lang, 'customTrip')}/`;
  if (ITEM_PARENT[key]) return `/${lang}/${segment(lang, ITEM_PARENT[key])}/${param}/`;
  return `/${lang}/${segment(lang, key)}/`;
}

/** Da un percorso (senza lingua) alla pagina: { key, param } oppure null. */
export function resolve(lang, rest) {
  const parts = rest.split('/').filter(Boolean);
  if (parts.length === 0) return { key: 'home' };
  if (parts.length === 1) {
    for (const key of Object.keys(S)) if (segment(lang, key) === parts[0] && key !== 'customTrip') return { key };
    return null;
  }
  if (parts.length === 2) {
    if (parts[0] === segment(lang, 'tours') && parts[1] === segment(lang, 'customTrip')) return { key: 'customTrip' };
    for (const [item, parent] of Object.entries(ITEM_PARENT)) {
      if (parts[0] === segment(lang, parent)) return { key: item, param: parts[1] };
    }
  }
  return null;
}

/** Lo stesso indirizzo in un'altra lingua (per il selettore lingua e hreflang). */
export function translatePath(path, fromLang, toLang) {
  const rest = path.replace(new RegExp(`^/${fromLang}(/|$)`), '/');
  if (rest.startsWith('/account')) return `/${toLang}${rest}`;
  const found = resolve(fromLang, rest);
  if (!found) return `/${toLang}/`;
  return pathFor(toLang, found.key, found.param);
}
