// Mappa del sito di una lingua, con le versioni nelle altre lingue (hreflang) per ogni pagina.
import type { APIRoute } from 'astro';
import { LANGS, LANG_INFO } from '~/i18n';
import { pathFor } from '~/i18n/routes.mjs';
import { staticPages } from '~/views/registry';

export const prerender = true;
export const getStaticPaths = () => LANGS.map((lang) => ({ params: { lang } }));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async ({ params, site }) => {
  const lang = params.lang!;
  const base = (site?.href ?? 'http://localhost:4321/').replace(/\/$/, '');
  const pages = await staticPages();
  const urls = pages.map(({ key, id }) => {
    const alts = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${LANG_INFO[l]?.hreflang ?? l}" href="${esc(base + pathFor(l, key, id))}"/>`).join('');
    const xdefault = `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(base + pathFor('en', key, id))}"/>`;
    return `  <url><loc>${esc(base + pathFor(lang, key, id))}</loc>${alts}${xdefault}</url>`;
  });
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`,
    { headers: { 'content-type': 'application/xml; charset=utf-8' } },
  );
};
