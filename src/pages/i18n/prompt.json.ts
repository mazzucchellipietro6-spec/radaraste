// Testi dell'avviso "Vuoi vedere il sito in ...?" in tutte le lingue (scaricati solo se servono).
import type { APIRoute } from 'astro';
import { LANGS, LANG_INFO, getTranslator } from '~/i18n';

export const GET: APIRoute = async () => {
  const out: Record<string, { q: string; yes: string; no: string; dir: string }> = {};
  for (const l of LANGS) {
    const tr = await getTranslator(l);
    const language = LANG_INFO[l].name;
    out[l] = { q: tr.t('lang.promptQuestion', { language }), yes: tr.t('lang.promptYes', { language }), no: tr.t('lang.promptNo'), dir: tr.dir };
  }
  return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
