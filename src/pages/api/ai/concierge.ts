// Commento dell'assistente AI alle proposte del Marble Concierge (facoltativo: senza AI restano le proposte del catalogo).
import type { APIRoute } from 'astro';
import { aiProvider } from '~/lib/server/ai';
import { clientIp, fail, json } from '~/lib/server/http';
import { rateLimit } from '~/lib/server/rate-limit';
import { LANG_INFO } from '~/i18n';
import { catalogueHints } from './match';

export const prerender = false;

const clean = (v: unknown, max = 120): string | string[] =>
  Array.isArray(v) ? v.slice(0, 12).map((x) => String(x).slice(0, max)) : String(v ?? '').slice(0, max);

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const provider = aiProvider();
  if (!provider) return fail('not_configured');
  const ip = clientIp(request, clientAddress);
  if (!(await rateLimit(`ai-concierge:${ip}`, 10, 3600))) return fail('rate_limited');
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const lang = typeof body.lang === 'string' && LANG_INFO[body.lang] ? body.lang : 'en';
  const raw = (body.brief ?? {}) as Record<string, unknown>;
  const brief = Object.fromEntries(
    ['project', 'use', 'color', 'intensity', 'pattern', 'material', 'quantity', 'unit', 'finish', 'country', 'city', 'budget'].map((k) => [k, clean(raw[k])]),
  );
  const wanted = Array.isArray(body.candidates) ? body.candidates.map(String) : [];
  const candidates = (await catalogueHints()).filter((c) => wanted.includes(c.slug));
  if (!candidates.length) return fail('invalid');
  try {
    const result = await provider.conciergeAdvice({ language: `${LANG_INFO[lang].english} (${lang})`, brief, candidates });
    return result ? json({ ok: true, result }) : fail('server_error');
  } catch (err) {
    console.error('[ai/concierge]', (err as Error).message);
    return fail('server_error');
  }
};
