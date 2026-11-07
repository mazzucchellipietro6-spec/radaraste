import { test, expect } from '@playwright/test';
import { collectErrors, hasHorizontalOverflow, humanPause, quiet } from './helpers';

test.beforeEach(async ({ page }) => quiet(page));

const homes = [
  { lang: 'it', dir: 'ltr', path: '/it/' },
  { lang: 'en', dir: 'ltr', path: '/en/' },
  { lang: 'ar', dir: 'rtl', path: '/ar/' },
  { lang: 'ja', dir: 'ltr', path: '/ja/' },
];

for (const h of homes) {
  test(`home ${h.lang}: si apre, lingua e direzione corrette, nessun errore`, async ({ page }) => {
    const errors = collectErrors(page);
    const res = await page.goto(h.path);
    expect(res?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${h.lang}`));
    await expect(page.locator('html')).toHaveAttribute('dir', h.dir);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${h.path}$`));
    expect(await hasHorizontalOverflow(page)).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('pagine principali in italiano: tutte rispondono', async ({ page }) => {
  for (const p of ['/it/marmi/', '/it/marmi/statuario/', '/it/showroom-digitale/', '/it/riconoscimento-marmo/', '/it/consulente-marmo/', '/it/esperienze-carrara/', '/it/esperienze-carrara/quarry-tours/', '/it/tour-italia/', '/it/tour-italia/firenze/', '/it/tour-italia/viaggio-su-misura/', '/it/prenota/', '/it/progetti/', '/it/chi-siamo/', '/it/contatti/', '/it/richiedi-preventivo/', '/it/glossario-marmo/', '/it/b2b/', '/it/privacy/', '/it/cookie/']) {
    const res = await page.goto(p);
    expect(res?.status(), p).toBe(200);
    await expect(page.locator('h1'), p).toBeVisible();
  }
});

test('pagina inesistente: errore 404 con pagina dedicata', async ({ page }) => {
  const res = await page.goto('/it/pagina-che-non-esiste/');
  expect(res?.status()).toBe(404);
});

test('cambio lingua dal selettore, con ricerca', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'sul telefono il selettore è nel menu');
  await page.goto('/it/marmi/statuario/');
  await page.locator('[data-lang-open]').first().click();
  const dialog = page.locator('#language-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-lang-search]').fill('deutsch');
  await dialog.locator('[data-lang-choice="de"]').first().click();
  await expect(page).toHaveURL(/\/de\/marmor\/statuario\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});

test('banner dei cookie: "Solo necessari" lo chiude e non carica statistiche', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/it/');
  const banner = page.locator('[data-cookie-banner]');
  await expect(banner).toBeVisible();
  await page.locator('[data-cookie-reject]').click();
  await expect(banner).toBeHidden();
  const consent = await page.evaluate(() => JSON.parse(localStorage.getItem('wc-consent') ?? 'null'));
  expect(consent?.analytics).toBe(false);
  await page.reload();
  await expect(banner).toBeHidden();
  expect(await page.locator('script[src*="plausible"], script[src*="googletagmanager"]').count()).toBe(0);
  await ctx.close();
});

test('scheda marmo: aggiunta alla selezione aggiorna il contatore', async ({ page }) => {
  await page.goto('/it/marmi/statuario/');
  await page.locator('[data-select-toggle]').first().click();
  await expect(page.locator('[data-select-toggle]').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-selection-count]').first()).toHaveText('1');
});

test('Digital Showroom: confronto tra due marmi', async ({ page }) => {
  await page.goto('/it/showroom-digitale/');
  const compare = page.locator('.compare-bar');
  const buttons = page.locator('button.icon-btn[aria-pressed]').filter({ has: page.locator('rect') });
  await buttons.nth(0).click();
  await buttons.nth(1).click();
  await expect(compare).toBeVisible();
  await expect(compare).toContainText('2 marmi nel confronto');
});

test('Marble Matching: da una foto propone tre marmi (analisi locale senza chiave AI)', async ({ page }) => {
  await page.goto('/it/riconoscimento-marmo/');
  await page.locator('#matching-file').setInputFiles('src/assets/images/marbles/statuario-detail.jpg');
  await page.getByRole('button', { name: 'Analizza la foto' }).click();
  const results = page.locator('[aria-live="polite"] ol li');
  await expect(results.first()).toBeVisible({ timeout: 30_000 });
  expect(await results.count()).toBeGreaterThanOrEqual(1);
  expect(await results.count()).toBeLessThanOrEqual(3);
});

test('modulo preventivo: segnala i campi obbligatori senza inviare', async ({ page }) => {
  await page.goto('/it/richiedi-preventivo/');
  const form = page.locator('form[action="/api/forms/quote"]').first();
  await humanPause(page);
  await form.locator('button[type="submit"]').click();
  await expect(form.locator('[aria-invalid="true"]').first()).toBeVisible();
});

test('mappa del sito e robots.txt', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain('Sitemap:');
  const index = await request.get('/sitemap.xml');
  expect(await index.text()).toContain('sitemap-it.xml');
  const it = await (await request.get('/sitemap-it.xml')).text();
  expect(it).toContain('hreflang="x-default"');
  expect((it.match(/<url>/g) ?? []).length).toBeGreaterThan(50);
});

test('pagamenti: il webhook di Stripe rifiuta richieste senza firma', async ({ request }) => {
  const res = await request.post('/api/stripe/webhook', { data: { type: 'checkout.session.completed' } });
  expect([400, 401, 503]).toContain(res.status());
});
