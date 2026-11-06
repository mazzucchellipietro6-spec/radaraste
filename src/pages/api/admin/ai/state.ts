// Stato reale dell'azienda AI per la sede 3D e la control room (aggiornato dal browser ogni pochi secondi).
import type { APIRoute } from 'astro';
import { canSeeAi, companyState } from '~/lib/server/company';
import { fail, json } from '~/lib/server/http';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin;
  if (!admin) return fail('unauthorized');
  if (!canSeeAi(admin.profile)) return fail('forbidden');
  return json(await companyState(admin.user, admin.profile));
};
