// Indice delle mappe del sito: una mappa per lingua (così resta leggera anche con molte lingue).
import type { APIRoute } from 'astro';
import { LANGS } from '~/i18n';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const base = (site?.href ?? 'http://localhost:4321/').replace(/\/$/, '');
  const now = new Date().toISOString();
  const items = LANGS.map((l) => `  <sitemap><loc>${base}/sitemap-${l}.xml</loc><lastmod>${now}</lastmod></sitemap>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
