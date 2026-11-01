import type { APIRoute } from 'astro';
import { LANGS } from '~/i18n';
import { clearOverridesCache } from '~/i18n/overrides';
import { withUser } from '~/lib/server/db';
import { readBody } from '~/lib/server/http';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin!;
  if (!(admin.profile.role === 'admin' || admin.profile.permissions.includes('content'))) return new Response('Non autorizzato', { status: 403 });
  const b = await readBody(ctx.request);
  const lang = String(b._lang ?? '');
  const back = String(b._back ?? '/admin/translations/');
  if (!LANGS.includes(lang)) return new Response(null, { status: 303, headers: { location: '/admin/translations/' } });
  await withUser(admin.user.claims, async (tx) => {
    for (const [name, value] of Object.entries(b)) {
      if (!name.startsWith('t:')) continue;
      const key = name.slice(2).slice(0, 300);
      const text = String(value ?? '').trim().slice(0, 20000);
      const had = b[`o:${key}`] === '1';
      if (text) await tx`insert into public.translation_overrides (lang, key, text, updated_by, updated_at) values (${lang}, ${key}, ${text}, ${admin.user.id}, now())
        on conflict (lang, key) do update set text = excluded.text, updated_by = excluded.updated_by, updated_at = now(), active = true`;
      else if (had) await tx`delete from public.translation_overrides where lang = ${lang} and key = ${key}`;
    }
  });
  clearOverridesCache();
  return new Response(null, { status: 303, headers: { location: `${back.startsWith('/admin/') ? back : '/admin/translations/'}${back.includes('?') ? '&' : '?'}ok=1` } });
};
