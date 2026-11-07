// Risposte JSON uniformi per le API, con intestazioni di sicurezza e senza cache.
export type ApiError = 'invalid' | 'spam' | 'rate_limited' | 'not_configured' | 'unauthorized' | 'forbidden' | 'not_found' | 'server_error' | 'mfa_required';

const baseHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

// I numeri bigint del database (contatori, token) diventano numeri normali nel JSON
const replacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? Number(v) : v);

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data, replacer), { status, headers: { ...baseHeaders, ...extra } });
}

export function ok(data: Record<string, unknown> = {}) {
  return json({ ok: true, ...data });
}

const STATUS: Record<ApiError, number> = {
  invalid: 400,
  spam: 400,
  rate_limited: 429,
  not_configured: 503,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  server_error: 500,
  mfa_required: 403,
};

export function fail(code: ApiError, extra: Record<string, unknown> = {}) {
  return json({ ok: false, code, ...extra }, STATUS[code]);
}

/** Legge il corpo di un modulo (form-data, urlencoded o JSON) come oggetto semplice. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const data = await request.json().catch(() => ({}));
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  }
  const fd = await request.formData().catch(() => null);
  if (!fd) return {};
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    const all = fd.getAll(key).filter((v) => typeof v === 'string');
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

/** Indirizzo IP del visitatore (dietro i proxy di Vercel/Netlify). */
export function clientIp(request: Request, fallback?: string) {
  return (
    request.headers.get('x-nf-client-connection-ip') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    fallback ??
    'unknown'
  );
}
