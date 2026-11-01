#!/usr/bin/env node
// SOLO PER I TEST: imita le parti del servizio di autenticazione di Supabase (GoTrue) usate dal sito,
// così i test possono provare registrazione, accesso, link via email e MFA senza un progetto Supabase.
// Gli utenti vengono scritti in auth.users del Postgres di prova (che crea il profilo con il trigger).
//   MOCK_AUTH_PORT=54330 TEST_DATABASE_URL=postgres://postgres@localhost:54329/wc node tests/support/mock-gotrue.mjs
import { createServer } from 'node:http';
import { createHmac, randomBytes, randomUUID, createHash } from 'node:crypto';
import postgres from 'postgres';

const PORT = Number(process.env.MOCK_AUTH_PORT ?? 54330);
const SECRET = process.env.MOCK_JWT_SECRET ?? 'test-secret-for-local-only-0123456789';
const sql = postgres(process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:54329/wc', { max: 2 });

const users = new Map(); // id -> { id, email, password, confirmed, meta, factors: [] }
const tokens = new Map(); // hashed_token -> { userId, type }
const refresh = new Map(); // refresh -> { userId, aal }
const challenges = new Map();

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jwt(user, aal = 'aal1') {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'authenticated', exp: now + 3600, iat: now, sub: user.id, email: user.email, role: 'authenticated', aal,
    amr: [{ method: aal === 'aal2' ? 'totp' : 'password', timestamp: now }], session_id: randomUUID(), is_anonymous: false,
    user_metadata: user.meta ?? {}, app_metadata: { provider: 'email' },
  };
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [h, b, s] = String(token ?? '').split('.');
  if (!s || createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url') !== s) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  return p.exp > Date.now() / 1000 ? p : null;
}
const publicUser = (u) => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.confirmed ? new Date().toISOString() : null,
  user_metadata: u.meta ?? {}, app_metadata: { provider: 'email', providers: ['email'] }, created_at: u.created, updated_at: new Date().toISOString(),
  factors: u.factors.map((f) => ({ id: f.id, factor_type: 'totp', status: f.verified ? 'verified' : 'unverified', friendly_name: f.name, created_at: u.created, updated_at: u.created })),
  identities: [],
});
function session(u, aal = 'aal1') {
  const rt = randomBytes(16).toString('hex');
  refresh.set(rt, { userId: u.id, aal });
  return { access_token: jwt(u, aal), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: rt, user: publicUser(u) };
}
// TOTP (RFC 6238) per verificare i codici MFA come farebbe Supabase
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(s) {
  let bits = '';
  for (const c of s.replace(/=+$/, '')) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
export function totp(secret, t = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / 30)));
  const h = createHmac('sha1', b32decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}

async function upsertDbUser(u) {
  await sql`insert into auth.users (id, email, raw_user_meta_data) values (${u.id}, ${u.email}, ${sql.json(u.meta ?? {})}) on conflict (id) do nothing`;
}

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || '{}');
  } catch {
    return {};
  }
}
const send = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(data === undefined ? '' : JSON.stringify(data));
};
const err = (res, status, msg, code) => send(res, status, { code: status, error_code: code ?? 'error', msg, message: msg, error: code ?? 'error', error_description: msg });
const bearer = (req) => verify((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname.replace(/^\/auth\/v1/, '');
  try {
    if (req.method === 'POST' && p === '/admin/generate_link') {
      const b = await body(req);
      let u = [...users.values()].find((x) => x.email === b.email?.toLowerCase());
      if (b.type === 'signup') {
        if (u?.confirmed) return err(res, 422, 'A user with this email address has already been registered', 'email_exists');
        if (!u) {
          u = { id: randomUUID(), email: b.email.toLowerCase(), password: b.password, confirmed: false, meta: b.data ?? {}, factors: [], created: new Date().toISOString() };
          users.set(u.id, u);
          await upsertDbUser(u);
        }
      }
      if (!u) return err(res, 404, 'User not found', 'user_not_found');
      const raw = randomBytes(20).toString('hex');
      const hashed = createHash('sha224').update(raw).digest('hex');
      tokens.set(hashed, { userId: u.id, type: b.type });
      return send(res, 200, { ...publicUser(u), action_link: `http://localhost:${PORT}/auth/v1/verify?token=${hashed}&type=${b.type}`, email_otp: '000000', hashed_token: hashed, verification_type: b.type, redirect_to: '' });
    }
    if (req.method === 'POST' && p === '/verify') {
      const b = await body(req);
      const t = tokens.get(b.token_hash);
      if (!t) return err(res, 403, 'Token has expired or is invalid', 'otp_expired');
      tokens.delete(b.token_hash);
      const u = users.get(t.userId);
      u.confirmed = true;
      return send(res, 200, session(u));
    }
    if (req.method === 'POST' && p === '/token') {
      const b = await body(req);
      if (url.searchParams.get('grant_type') === 'password') {
        const u = [...users.values()].find((x) => x.email === String(b.email).toLowerCase());
        if (!u || u.password !== b.password) return err(res, 400, 'Invalid login credentials', 'invalid_credentials');
        if (!u.confirmed) return err(res, 400, 'Email not confirmed', 'email_not_confirmed');
        return send(res, 200, session(u));
      }
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const r = refresh.get(b.refresh_token);
        if (!r) return err(res, 400, 'Invalid Refresh Token', 'refresh_token_not_found');
        refresh.delete(b.refresh_token);
        return send(res, 200, session(users.get(r.userId), r.aal));
      }
    }
    if (p === '/user') {
      const c = bearer(req);
      if (!c) return err(res, 401, 'invalid JWT', 'bad_jwt');
      const u = users.get(c.sub);
      if (!u) return err(res, 404, 'User not found', 'user_not_found');
      if (req.method === 'PUT') {
        const b = await body(req);
        if (b.password) u.password = b.password;
      }
      return send(res, 200, publicUser(u));
    }
    if (req.method === 'POST' && p === '/logout') return send(res, 204);
    if (req.method === 'POST' && p === '/factors') {
      const c = bearer(req);
      if (!c) return err(res, 401, 'invalid JWT');
      const u = users.get(c.sub);
      const secret = Array.from(randomBytes(20), (x) => B32[x % 32]).join('');
      const f = { id: randomUUID(), secret, verified: false, name: 'WHITE CARRARA' };
      u.factors.push(f);
      return send(res, 200, { id: f.id, type: 'totp', friendly_name: f.name, totp: { qr_code: `data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>`, secret, uri: `otpauth://totp/WC:${u.email}?secret=${secret}&issuer=WC` } });
    }
    let m = /^\/factors\/([^/]+)\/challenge$/.exec(p);
    if (req.method === 'POST' && m) {
      const id = randomUUID();
      challenges.set(id, m[1]);
      return send(res, 200, { id, type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
    }
    m = /^\/factors\/([^/]+)\/verify$/.exec(p);
    if (req.method === 'POST' && m) {
      const c = bearer(req);
      const b = await body(req);
      const u = c && users.get(c.sub);
      const f = u?.factors.find((x) => x.id === m[1]);
      if (!f || challenges.get(b.challenge_id) !== f.id || b.code !== totp(f.secret)) return err(res, 422, 'Invalid TOTP code entered', 'mfa_verification_failed');
      f.verified = true;
      return send(res, 200, session(u, 'aal2'));
    }
    m = /^\/admin\/users\/([^/]+)$/.exec(p);
    if (req.method === 'DELETE' && m) {
      users.delete(m[1]);
      await sql`delete from auth.users where id = ${m[1]}`;
      return send(res, 200, {});
    }
    if (p === '/_test/secret') {
      const email = url.searchParams.get('email');
      const u = [...users.values()].find((x) => x.email === email);
      return send(res, 200, { secrets: u?.factors.map((f) => f.secret) ?? [] });
    }
    return err(res, 404, `mock: ${req.method} ${p} non gestito`);
  } catch (e) {
    console.error(e);
    return err(res, 500, String(e));
  }
}).listen(PORT, () => console.log(`mock GoTrue su http://localhost:${PORT}`));
