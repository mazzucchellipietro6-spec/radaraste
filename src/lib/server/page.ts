// Inizio comune delle pagine dinamiche: lingua valida e traduttore.
import { getTranslator, isLang } from '~/i18n';
export async function pageLang(param: string | undefined) {
  const lang = isLang(param) ? param : 'en';
  return { lang, tr: await getTranslator(lang) };
}
