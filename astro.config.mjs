// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import preact from '@astrojs/preact';
import keystatic from '@keystatic/astro';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
import netlify from '@astrojs/netlify';

// L'adattatore si sceglie da solo: Vercel e Netlify impostano queste variabili durante il build.
function adapter() {
  if (process.env.VERCEL) return vercel({ maxDuration: 30 });
  if (process.env.NETLIFY) return netlify();
  return node({ mode: 'standalone' });
}

// Indirizzo pubblico del sito (serve per canonical, hreflang, sitemap, link nelle email).
function siteUrl() {
  const explicit = process.env.PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  if (process.env.URL) return process.env.URL.replace(/\/$/, ''); // Netlify
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:4321';
}

const isDev = process.argv.includes('dev');
// Il pannello contenuti (Keystatic) è sempre attivo in locale; online solo se collegato a GitHub.
const keystaticEnabled = isDev || !!process.env.KEYSTATIC_GITHUB_REPO || process.env.KEYSTATIC_LOCAL === 'true';

export default defineConfig({
  site: siteUrl(),
  output: 'static',
  adapter: adapter(),
  trailingSlash: 'ignore',
  build: { format: 'directory', inlineStylesheets: 'auto' },
  integrations: [
    // Preact per le parti interattive del sito (leggero), React solo per il pannello Keystatic
    preact({ include: ['**/islands/**'] }),
    react({ include: ['**/keystatic.config.*', '**/node_modules/@keystatic/**'] }),
    ...(keystaticEnabled ? [keystatic()] : []),
  ],
  vite: {
    plugins: [tailwindcss()],
    define: {
      'import.meta.env.KEYSTATIC_ENABLED': JSON.stringify(keystaticEnabled),
    },
  },
  security: { checkOrigin: true },
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  devToolbar: { enabled: false },
  server: { host: true },
});
