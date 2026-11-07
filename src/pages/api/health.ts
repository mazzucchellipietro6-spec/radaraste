// Stato del sito per il monitoraggio (uptime): risponde 200 se il sito e il database funzionano.
// Non mostra versioni, configurazioni o dati.
import type { APIRoute } from 'astro';
import { asSystem, dbConfigured } from '~/lib/server/db';

export const prerender = false;

export const GET: APIRoute = async () => {
  let db: 'ok' | 'error' | 'not_configured' = 'not_configured';
  if (dbConfigured()) {
    try {
      await asSystem((tx) => tx`select 1`);
      db = 'ok';
    } catch {
      db = 'error';
    }
  }
  const ok = db !== 'error';
  return new Response(JSON.stringify({ ok, db, at: new Date().toISOString() }), {
    status: ok ? 200 : 503,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
