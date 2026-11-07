// Sicurezza verificata dal browser (audit S1, S8). Solo con E2E_DB=1 sull'ambiente di prova.
import { test, expect } from '@playwright/test';
import postgres from 'postgres';
import { localEnv, quiet } from './helpers';

test.skip(!process.env.E2E_DB, 'servono E2E_DB=1 e l\'ambiente di prova (vedi README.md, "Test")');
test.beforeEach(async ({ page }) => quiet(page));

test('una correzione di traduzione con script non esegue codice nelle pagine pubbliche', async ({ page }) => {
  test.setTimeout(120_000);
  const sql = postgres(localEnv('DATABASE_URL')!, { max: 1 });
  const key = 'marbles/statuario/description.0';
  await sql`insert into public.translation_overrides (lang, key, text) values ('it', ${key},
    ${'<p>Statuario corretto <img src=x onerror="window.__xss=1"><script>window.__xss=2</script><a href="javascript:window.__xss=3">x</a></p>'})
    on conflict (lang, key) do update set text = excluded.text, active = true`;
  try {
    // le correzioni si rileggono al massimo ogni 60 secondi
    await expect.poll(async () => {
      await page.goto('/it/marmi/statuario/');
      return page.locator('.prose-luxe').first().innerText();
    }, { timeout: 90_000, intervals: [5_000] }).toContain('Statuario corretto');
    const html = await page.locator('.prose-luxe').first().innerHTML();
    expect(html).not.toMatch(/<script|onerror|javascript:/i);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  } finally {
    await sql`delete from public.translation_overrides where key = ${key}`;
    await sql.end();
  }
});

test('un accesso fallito resta tra gli eventi di sicurezza, senza email né IP in chiaro', async ({ page }) => {
  const sql = postgres(localEnv('DATABASE_URL')!, { max: 1 });
  const email = `nessuno+${Date.now()}@example.com`;
  await page.goto('/it/account/login/');
  const form = page.locator('form').filter({ has: page.getByLabel('Password') });
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Password').fill('password-sbagliata-123');
  await page.waitForTimeout(2100);
  await form.getByRole('button', { name: /^Accedi$/ }).click();
  await expect(page).toHaveURL(/error=invalid/);
  const masked = `${email.slice(0, 1)}***@example.com`;
  const [ev] = await sql`select kind, actor, ip_hash, details from public.security_events where kind = 'login_failed' and actor = ${masked} order by id desc limit 1`;
  await sql.end();
  expect(ev?.kind).toBe('login_failed');
  expect(JSON.stringify(ev)).not.toContain(email);
  expect(ev.ip_hash).toMatch(/^[0-9a-f]{24}$/);
});
