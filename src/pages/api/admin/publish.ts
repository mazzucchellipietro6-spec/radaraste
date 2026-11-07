// Avvia un nuovo build su Vercel/Netlify (Deploy Hook) per pubblicare correzioni e contenuti.
import type { APIRoute } from 'astro';
import { env } from '~/lib/server/env';
import { asSystem } from '~/lib/server/db';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin!;
  const can = admin.profile.role === 'admin' || admin.profile.permissions.includes('content');
  const hook = env('DEPLOY_HOOK_URL');
  const back = (q: string) => new Response(null, { status: 303, headers: { location: `/admin/content/?${q}` } });
  if (!can) return back('error=Permesso%20mancante');
  if (!hook) return back('error=DEPLOY_HOOK_URL%20non%20impostato');
  const res = await fetch(hook, { method: 'POST' }).catch(() => null);
  await asSystem((tx) => tx`insert into public.audit_log (actor_id, actor, action, table_name) values (${admin.user.id}, ${admin.user.email}, 'publish', 'site')`);
  return res?.ok ? back('ok=Nuovo%20build%20avviato:%20il%20sito%20sar%C3%A0%20aggiornato%20tra%20qualche%20minuto.') : back('error=Il%20servizio%20di%20pubblicazione%20non%20ha%20risposto');
};
