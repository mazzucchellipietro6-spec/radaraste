#!/usr/bin/env node
// Avvia in locale il sito già compilato (npm run build), come in produzione.
import { existsSync } from 'node:fs';
process.env.HOST ??= '0.0.0.0';
process.env.PORT ??= '4321';
const entry = new URL('../dist/server/entry.mjs', import.meta.url);
if (!existsSync(entry)) {
  console.error('Prima esegui: npm run build');
  process.exit(1);
}
await import(entry.href);
console.log(`Sito avviato su http://localhost:${process.env.PORT}`);
