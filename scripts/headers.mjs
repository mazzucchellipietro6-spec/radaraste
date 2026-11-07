#!/usr/bin/env node
// Scrive vercel.json e netlify.toml con le intestazioni di sicurezza di src/lib/security-headers.mjs.
//   npm run headers
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECURITY_HEADERS } from '../src/lib/security-headers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const immutable = 'public, max-age=31536000, immutable';
const pairs = Object.entries(SECURITY_HEADERS);

const vercel = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  headers: [
    { source: '/(.*)', headers: pairs.map(([key, value]) => ({ key, value })) },
    { source: '/_astro/(.*)', headers: [{ key: 'cache-control', value: immutable }] },
    { source: '/(admin|keystatic)(.*)', headers: [{ key: 'x-robots-tag', value: 'noindex, nofollow' }] },
  ],
};
writeFileSync(join(root, 'vercel.json'), JSON.stringify(vercel, null, 2) + '\n');

const q = (s) => JSON.stringify(s);
const netlify = `# Generato da \`npm run headers\` a partire da src/lib/security-headers.mjs: non modificare a mano.
[build]
  command = "npm run build"
  publish = "dist"

[[headers]]
  for = "/*"
  [headers.values]
${pairs.map(([k, v]) => `    ${k} = ${q(v)}`).join('\n')}

[[headers]]
  for = "/_astro/*"
  [headers.values]
    cache-control = ${q(immutable)}

[[headers]]
  for = "/admin/*"
  [headers.values]
    x-robots-tag = "noindex, nofollow"
`;
writeFileSync(join(root, 'netlify.toml'), netlify);
console.log('Scritti vercel.json e netlify.toml');
