// HTML sicuro per i testi editoriali (Markdown del catalogo e correzioni delle traduzioni dal pannello).
// Chi modifica i contenuti non deve poter inserire script, gestori di eventi, iframe o link javascript:
// il risultato viene mostrato a tutti i visitatori, amministratori compresi.
import sanitizeHtml from 'sanitize-html';

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'h5', 'blockquote',
    'span', 'abbr', 'small', 'sup', 'sub', 'code', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  allowedAttributes: { a: ['href', 'title', 'target', 'rel'], abbr: ['title'], span: ['lang'], th: ['scope'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.target === '_blank' ? { ...attribs, rel: 'noopener noreferrer' } : attribs,
    }),
  },
};

export function safeHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}

/** JSON da inserire in <script type="application/ld+json">: niente sequenze che chiudono lo script. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
