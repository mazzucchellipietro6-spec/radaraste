// Marble Matching con AI: riceve una foto (non viene salvata) e chiede al provider AI
// i tre marmi del catalogo più simili. Protetto da limiti di frequenza e, se configurato, Turnstile.
import type { APIRoute } from 'astro';
import { aiProvider, type CatalogueHint } from '~/lib/server/ai';
import { env } from '~/lib/server/env';
import { clientIp, fail, json } from '~/lib/server/http';
import { rateLimit } from '~/lib/server/rate-limit';
import { verifyTurnstile } from '~/lib/server/turnstile';
import { LANG_INFO, getTranslator } from '~/i18n';
import { marbles } from '~/lib/site';

export const prerender = false;
const MAX_BYTES = 3 * 1024 * 1024;

function decode(dataUrl: unknown) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0 || buf.length > MAX_BYTES) return null;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const isWebp = buf.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) return null;
  return { mediaType: m[1] as 'image/jpeg' | 'image/png' | 'image/webp', buf };
}

export async function catalogueHints(): Promise<CatalogueHint[]> {
  const en = await getTranslator('en');
  return (await marbles()).map((m) => {
    const d = en.localize('marbles', m.id, m.data);
    return {
      slug: m.id,
      name: d.name,
      category: m.data.category,
      baseColor: d.baseColor.map((x) => en.t(`vocab.baseColor.${x}`)),
      veinColor: d.veinColor.map((x) => en.t(`vocab.veinColor.${x}`)),
      veinIntensity: en.t(`vocab.veinIntensity.${d.veinIntensity}`),
      veinPattern: en.t(`vocab.veinPattern.${d.veinPattern}`),
      visualNotes: d.visualNotes.replace(/<[^>]+>/g, ' '),
    };
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const provider = aiProvider();
  if (!provider) return fail('not_configured');
  const ip = clientIp(request, clientAddress);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!(await verifyTurnstile(body['cf-turnstile-response'], ip))) return fail('spam');
  const perHour = Number(env('AI_MATCH_PER_HOUR') ?? 12);
  const perDay = Number(env('AI_DAILY_LIMIT') ?? 300);
  if (!(await rateLimit(`ai:${ip}`, perHour, 3600))) return fail('rate_limited');
  if (!(await rateLimit(`ai:global:${new Date().toISOString().slice(0, 10)}`, perDay, 86400))) return fail('rate_limited');
  const img = decode(body.image);
  if (!img) return fail('invalid', { errors: { image: 'invalid' } });
  const lang = typeof body.lang === 'string' && LANG_INFO[body.lang] ? body.lang : 'en';
  try {
    const result = await provider.analyzeMarble({
      image: img.buf,
      mediaType: img.mediaType,
      language: `${LANG_INFO[lang].english} (${lang})`,
      catalogue: await catalogueHints(),
    });
    if (!result) return fail('server_error');
    return json({ ok: true, provider: provider.name, result });
  } catch (err) {
    console.error('[ai/match]', (err as Error).message);
    return fail('server_error');
  }
};
