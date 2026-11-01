// Catalogo tradotto in JSON (statico, uno per lingua) per le parti interattive del sito.
import type { APIRoute } from 'astro';
import { LANGS, getTranslator } from '~/i18n';
import { catalogue } from '~/lib/catalogue';

export const getStaticPaths = () => LANGS.map((lang) => ({ params: { lang } }));

export const GET: APIRoute = async ({ params }) => {
  const tr = await getTranslator(params.lang!);
  return new Response(JSON.stringify({ lang: params.lang, items: await catalogue(tr) }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
