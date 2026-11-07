// Percorsi completi con database: prenotazione, registrazione con conferma via email, area clienti,
// pannello con verifica in due passaggi. Girano solo con E2E_DB=1 e un ambiente di prova
// (Postgres locale + tests/support/mock-gotrue.mjs + EMAIL_OUTBOX_DIR), MAI sul database di produzione.
import { test, expect } from '@playwright/test';
import postgres from 'postgres';
import { humanPause, lastAuthLink, localEnv, quiet, totp } from './helpers';

test.skip(!process.env.E2E_DB, 'servono E2E_DB=1 e l\'ambiente di prova (vedi README.md, "Test")');
test.beforeEach(async ({ page }) => quiet(page));

const stamp = Date.now();

test('prenotazione di un\'esperienza: arriva il riferimento WC-B', async ({ page }) => {
  await page.goto('/en/book/?experience=quarry-tours');
  await expect(page.locator('#booking-item')).toHaveValue(/quarry-tours/);
  await page.getByLabel('First name').fill('Anna');
  await page.getByLabel('Last name').fill('Rossi');
  await page.getByLabel('Email').fill(`anna+${stamp}@example.com`);
  await page.getByLabel('Phone').fill('+39 333 1234567');
  await page.locator('#booking-nationality').fill('Italy');
  await page.getByLabel('Preferred date').fill(new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10));
  await page.getByLabel('Number of participants').fill('4');
  await humanPause(page);
  const send = page.getByRole('button', { name: 'Send booking request' });
  await send.click();
  await expect(page.locator('[data-error-for="privacy"]')).not.toBeEmpty();
  await page.locator('input[name="privacy"]').check();
  await send.click();
  await expect(page.locator('[data-form-status]')).toContainText(/WC-B-\d{4}-\d+/, { timeout: 20_000 });
});

test('cliente: registrazione, conferma email, selezione salvata nell\'account', async ({ page }) => {
  const email = `cliente+${stamp}@example.com`;
  await page.goto('/it/account/register/');
  await page.getByLabel('Nome e cognome').fill('Giulia Bianchi');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('passwordlunga123');
  await page.locator('input[name="privacy"]').check();
  await humanPause(page);
  await page.getByRole('button', { name: /Crea l'account/ }).click();
  await expect(page.locator('[data-form-status]')).toBeVisible();
  const link = lastAuthLink(email);
  expect(link, 'email di conferma non trovata in EMAIL_OUTBOX_DIR').toBeTruthy();
  await page.goto(link!.replace(/^https?:\/\/[^/]+/, ''));
  await expect(page).toHaveURL(/\/it\/account\//);
  await page.goto('/it/marmi/statuario/');
  await page.getByRole('button', { name: 'Aggiungi alla mia selezione' }).click();
  await expect
    .poll(async () => page.evaluate(() => fetch('/api/me/favorites').then((r) => r.json())), { timeout: 10_000 })
    .toEqual({ items: ['statuario'] });
  for (const s of ['', 'profile/', 'favorites/', 'requests/', 'quotes/', 'bookings/', 'documents/', 'messages/']) {
    const res = await page.goto(`/it/account/${s}`);
    expect(res?.status(), s).toBe(200);
  }
});

test('pannello: l\'amministratore deve completare la verifica in due passaggi', async ({ page }) => {
  const email = `admin+${stamp}@example.com`;
  await page.goto('/it/account/register/');
  await page.getByLabel('Nome e cognome').fill('Amministratore Prova');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('passwordadmin123');
  await page.locator('input[name="privacy"]').check();
  await humanPause(page);
  await page.getByRole('button', { name: /Crea l'account/ }).click();
  await expect(page.locator('[data-form-status]')).toBeVisible();
  await page.goto(lastAuthLink(email)!.replace(/^https?:\/\/[^/]+/, ''));
  // promozione ad amministratore direttamente sul database di prova
  const sql = postgres(localEnv('DATABASE_URL')!, { max: 1 });
  await sql`update public.profiles set role = 'admin' where email = ${email}`;
  await sql.end();
  await page.goto('/admin/');
  await expect(page).toHaveURL(/\/admin\/mfa\//);
  const secret = (await page.locator('[data-secret]').innerText()).trim();
  await page.locator('input[name="code"]').fill(totp(secret));
  await page.getByRole('button', { name: 'Verifica' }).click();
  await expect(page).toHaveURL(/\/admin\/$/);
  for (const s of ['customers/', 'requests/', 'quotes/', 'suppliers/', 'trading/', 'brokerage/', 'orders/', 'bookings/', 'translations/', 'stats/']) {
    const res = await page.goto(`/admin/${s}`);
    expect(res?.status(), s).toBe(200);
    await expect(page.locator('h1'), s).toBeVisible();
  }
});

test('pagamenti Stripe in modalità test', async () => {
  test.skip(!(localEnv('STRIPE_SECRET_KEY') ?? '').startsWith('sk_test_'), 'serve una chiave Stripe di test (sk_test_...)');
  // Con la chiave di test: creare dal pannello un link di pagamento su una prenotazione confermata
  // e completarlo con la carta 4242 4242 4242 4242 (procedura descritta in DEPLOYMENT.md).
});
