// Intestazioni di sicurezza uniche per tutto il sito: usate dal middleware (pagine dinamiche)
// e copiate in vercel.json / netlify.toml (pagine statiche) da `npm run headers`.
// Se aggiungete un servizio esterno (per esempio Plausible su un vostro dominio), aggiungetelo qui.

export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://plausible.io https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.google-analytics.com https://www.googletagmanager.com https://avatars.githubusercontent.com",
  "font-src 'self'",
  "connect-src 'self' https://challenges.cloudflare.com https://plausible.io https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://api.github.com",
  'frame-src https://challenges.cloudflare.com https://www.openstreetmap.org',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://github.com",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

export const SECURITY_HEADERS = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=(), payment=(self "https://checkout.stripe.com"), interest-cohort=()',
  'cross-origin-opener-policy': 'same-origin',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
};
