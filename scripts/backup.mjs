#!/usr/bin/env node
// Copia di sicurezza del database (Supabase/PostgreSQL) con pg_dump.
//   npm run backup                       -> backups/white-carrara-AAAAMMGG-HHMM.sql.gz
//   BACKUP_DIR=/percorso npm run backup  -> altra cartella
//   BACKUP_KEEP=30                        -> quante copie tenere (le più vecchie create da questo script vengono tolte)
// Serve DATABASE_URL (la stringa di connessione "Session pooler" o diretta di Supabase) e pg_dump installato.
// Supabase fa già copie giornaliere sui piani a pagamento: questa è una copia in più, sotto il vostro controllo.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readdirSync, unlinkSync, existsSync, readFileSync, statSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('backup: manca DATABASE_URL (vedi .env.example)');
  process.exit(1);
}
const dir = process.env.BACKUP_DIR ?? join(root, 'backups');
const keep = Number(process.env.BACKUP_KEEP ?? 30);
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const file = join(dir, `white-carrara-${stamp}.sql.gz`);

// solo gli schemi dei dati del sito; utenti e file sono gestiti da Supabase (vedi DATABASE.md)
const dump = spawn('pg_dump', ['--no-owner', '--no-privileges', '--schema=public', '--format=plain', url], { stdio: ['ignore', 'pipe', 'inherit'] });
const closed = new Promise((resolve) => dump.on('close', resolve));
const fail = (msg) => {
  console.error(`backup: ${msg}`);
  if (existsSync(file)) unlinkSync(file);
  process.exit(1);
};
dump.on('error', (e) => fail(`impossibile avviare pg_dump (${e.message}). Installate i client PostgreSQL.`));
await pipeline(dump.stdout, createGzip({ level: 9 }), createWriteStream(file));
const code = await closed;
if (code !== 0) fail(`pg_dump è terminato con errore (${code}): nessuna copia salvata`);
console.log(`backup: creato ${file} (${(statSync(file).size / 1024).toFixed(0)} KB)`);

const mine = readdirSync(dir).filter((f) => /^white-carrara-\d{8}-\d{4}\.sql\.gz$/.test(f)).sort();
for (const f of mine.slice(0, Math.max(0, mine.length - keep))) {
  unlinkSync(join(dir, f));
  console.log(`backup: tolta la copia vecchia ${f}`);
}
