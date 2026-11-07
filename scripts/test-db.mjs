#!/usr/bin/env node
// Verifica lo schema del database su un Postgres di prova (MAI su quello di produzione):
//   TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:db
// Crea un database temporaneo, applica lo schema due volte (deve essere rieseguibile) e lancia i test RLS.
import { execFileSync } from 'node:child_process';
const base = process.env.TEST_DATABASE_URL;
if (!base) {
  console.error('Imposta TEST_DATABASE_URL (un Postgres di prova, non quello di produzione).');
  process.exit(1);
}
const name = `wc_test_${Date.now()}`;
const url = new URL(base);
const psql = (db, args) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return execFileSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', ...args], { stdio: 'inherit' });
};
psql(url.pathname.slice(1) || 'postgres', ['-c', `create database ${name}`]);
try {
  psql(name, ['-f', 'supabase/tests/local-auth-stub.sql']);
  // ogni migrazione due volte: devono essere rieseguibili
  for (const m of ['20261101000000_init.sql', '20261106000000_ai_company.sql', '20261107000000_security.sql']) {
    psql(name, ['-f', `supabase/migrations/${m}`]);
    psql(name, ['-f', `supabase/migrations/${m}`]);
  }
  psql(name, ['-f', 'supabase/tests/rls.test.sql']);
  psql(name, ['-f', 'supabase/tests/ai-rls.test.sql']);
  psql(name, ['-f', 'supabase/tests/security.test.sql']);
} finally {
  psql(url.pathname.slice(1) || 'postgres', ['-c', `drop database if exists ${name}`]);
}
