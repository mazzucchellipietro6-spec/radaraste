// Azienda AI nel pannello: sede 3D e control room con i 25 agenti, stato reale dal database,
// assegnazione di un incarico, approvazioni del fondatore, simulatore prezzi, documenti advisory.
// Gira con E2E_DB=1 sull'ambiente di prova (Postgres locale + finto servizio di accesso), MAI in produzione.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { humanPause, lastAuthLink, localEnv, quiet, totp } from './helpers';

test.skip(!process.env.E2E_DB, 'servono E2E_DB=1 e l\'ambiente di prova (vedi README.md, "Test")');
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const email = `fondatore+${stamp}@example.com`;
const taskTitle = `Bozza accordo di commissione ${stamp}`;
let sql: postgres.Sql;

async function syncAgents() {
  // stesso registro che usa il servizio agenti all'avvio (python -m wc_agents sync)
  const reg = JSON.parse(readFileSync('agents/config/agent-registry.json', 'utf8')) as {
    id: string; name: string; department: string; team?: string; title: string; effort: string; monthly_budget_usd: number;
    daily_task_limit: number; tools: string[]; can_delegate_to: string[]; objectives: string[]; kpis: string[];
  }[];
  for (const a of reg) {
    await sql`insert into public.ai_agents (id, name, department, team, title, model, effort, monthly_budget_usd, daily_task_limit, tools, can_delegate_to, objectives, kpis)
      values (${a.id}, ${a.name}, ${a.department}, ${a.team ?? null}, ${a.title}, 'claude-opus-5-5', ${a.effort}, ${a.monthly_budget_usd}, ${a.daily_task_limit},
              ${a.tools}, ${a.can_delegate_to}, ${a.objectives}, ${sql.json(a.kpis)})
      on conflict (id) do update set name = excluded.name, department = excluded.department, team = excluded.team, title = excluded.title,
        tools = excluded.tools, can_delegate_to = excluded.can_delegate_to, objectives = excluded.objectives, kpis = excluded.kpis, enabled = true`;
  }
  return reg.length;
}

async function loginAsFounder(page: Page) {
  await page.goto('/it/account/register/');
  await page.getByLabel('Nome e cognome').fill('Fondatore Prova');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('passwordfondatore123');
  await page.locator('input[name="privacy"]').check();
  await humanPause(page);
  await page.getByRole('button', { name: /Crea l'account/ }).click();
  await expect(page.locator('[data-form-status]')).toBeVisible();
  await page.goto(lastAuthLink(email)!.replace(/^https?:\/\/[^/]+/, ''));
  await sql`update public.profiles set role = 'admin' where email = ${email}`;
  await page.goto('/admin/');
  await expect(page).toHaveURL(/\/admin\/mfa\//);
  const secret = (await page.locator('[data-secret]').innerText()).trim();
  await page.locator('input[name="code"]').fill(totp(secret));
  await page.getByRole('button', { name: 'Verifica' }).click();
  await expect(page).toHaveURL(/\/admin\/$/);
}

test.beforeAll(async () => {
  sql = postgres(localEnv('DATABASE_URL')!, { max: 2 });
  await sql`delete from public.ai_runtime`;
});
test.afterAll(async () => {
  await sql`delete from public.ai_runtime where id like 'e2e-%'`;
  await sql.end();
});
test.beforeEach(async ({ page }) => quiet(page));

test('sede, control room, incarico, approvazioni, simulatore e documenti advisory', async ({ page }) => {
  expect(await syncAgents()).toBe(25);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await loginAsFounder(page);
  await expect(page.getByRole('heading', { name: 'Azienda AI' })).toBeVisible();
  await expect(page.getByText('Non collegati')).toBeVisible();

  // 1. senza servizio agenti: nessuno è rappresentato come operativo
  await page.goto('/admin/ai/');
  await expect(page.locator('h1')).toHaveText("Sede dell'azienda AI");
  await expect(page.getByText('Gli agenti non sono collegati.')).toBeVisible();
  const room = page.getByRole('region', { name: 'Control room' });
  await expect(room.getByText('Executive & Professional Advisory')).toBeVisible();
  for (const n of ['AI CEO', 'Operations Manager', 'Business Process Engineer', 'Business Analyst', 'Legal Counsel Agent', 'Tax & Accounting Advisor']) {
    await expect(room.getByRole('button', { name: new RegExp(`^${n.replace(/[&]/g, '\\$&')}`) })).toBeVisible();
  }
  await expect(room.getByText('Non collegato')).toHaveCount(25);
  await page.locator('section[aria-label="Sede virtuale 3D"] canvas').waitFor({ timeout: 20_000 });

  // 2. scheda dell'avvocato AI e nuovo incarico (resta in coda: il servizio non è acceso)
  await room.getByRole('button', { name: /^Legal Counsel Agent/ }).click();
  const panel = page.locator('aside[aria-live="polite"]:visible');
  await expect(panel.getByText('Avvocato aziendale AI')).toBeVisible();
  await expect(panel.getByText('Da rivedere da un avvocato')).toBeVisible();
  await panel.getByLabel("Titolo dell'incarico").fill(taskTitle);
  await panel.getByLabel('Istruzioni').fill('Prepara una bozza di accordo di commissione con un fornitore di Carrara, con legge applicabile e foro.');
  await panel.getByRole('button', { name: 'Assegna' }).click();
  await expect(panel.getByText(/Incarico salvato in coda/)).toBeVisible();
  const [t] = await sql`select t.status, t.created_by, p.email from public.ai_tasks t join public.profiles p on p.id = t.created_by
                        where t.agent_id = '24-legal-counsel' and t.title = ${taskTitle}`;
  expect(t.status).toBe('queued');
  expect(t.email).toBe(email);
  await page.keyboard.press('Escape');

  // 3. servizio acceso con la chiave: lo stato segue il database (un agente al lavoro, gli altri disponibili)
  await sql`insert into public.ai_runtime (id, version, info) values ('e2e-worker', '1.0.0', ${sql.json({ llm_configured: true })})`;
  await sql`update public.ai_tasks set status = 'running', activity = 'calculation', started_at = now(), locked_by = 'e2e-worker'
            where agent_id = '24-legal-counsel' and title = ${taskTitle}`;
  await page.reload();
  await expect(page.getByText('Gli agenti non sono collegati.')).toHaveCount(0);
  await expect(room.getByRole('button', { name: /^Legal Counsel Agent.*Al lavoro/ })).toBeVisible();
  await expect(room.getByText('Non collegato')).toHaveCount(0);
  await sql`update public.ai_tasks set status = 'cancelled', finished_at = now() where agent_id = '24-legal-counsel' and status = 'running'`;
  await page.screenshot({ path: 'test-results/ai-headquarters.png', fullPage: false });

  // 4. approvazioni: il rifiuto richiede una nota, l'approvazione è registrata
  const [a] = await sql`insert into public.approvals (kind, title, summary, payload, requested_by_agent)
    values ('outbound_message', ${`Email a buyer+${stamp}@example.com`}, 'Primo contatto commerciale',
            ${sql.json({ to: `buyer+${stamp}@example.com`, subject: 'Marmo di Carrara', body: 'Gentili, ...', legal_basis: 'legitimate_interest' })}, '05-crm-follow-up')
    returning id`;
  await page.goto('/admin/approvals/');
  const card = page.locator(`li[id="${a.id}"]`);
  await expect(card.getByText('Marmo di Carrara')).toBeVisible();
  await card.getByRole('button', { name: 'Rifiuta' }).click();
  await expect(page.getByRole('alert')).toContainText('scrivi il motivo');
  await page.locator(`li[id="${a.id}"]`).getByRole('button', { name: 'Approva' }).click();
  await expect(page.getByRole('status')).toContainText('approvata');
  const [d] = await sql`select status, decided_by from public.approvals where id = ${a.id}`;
  expect(d.status).toBe('approved');
  expect(d.decided_by).toBeTruthy();

  // 5. simulatore prezzi: stessi risultati del servizio agenti (caso CIF dei test condivisi)
  await page.goto('/admin/ai/pricing/');
  const fill = async (label: string, v: string, status = 'stimato') => {
    await page.getByLabel(label, { exact: true }).fill(v);
    await page.getByLabel(`Qualità: ${label}`).selectOption({ label: status });
  };
  await fill('Quantità', '100', 'verificato');
  await fill('Costo d’acquisto unitario', '120', 'verificato');
  await fill('Lavorazioni', '500', 'verificato');
  await fill('Imballaggio', '300', 'verificato');
  await fill('Trasporto', '1800');
  await fill('Assicurazione', '0.5');
  await fill('Dazi (solo DDP)', '5');
  await fill('Commissioni di pagamento', '1', 'verificato');
  await fill('Margine obiettivo', '25', 'verificato');
  await expect(page.getByText(/19\.822,97/)).toBeVisible();
  await expect(page.getByText('Qualità del risultato:')).toContainText('stimato');

  // 6. documenti advisory e nuove sezioni commerciali
  for (const s of ['advisoryDocs/', 'leads/', 'opportunities/', 'crmActivities/', 'marketAnalyses/', 'marketingAssets/', 'purchaseOrders/', 'certifications/', 'aiSchedules/', 'suppression/', 'pricingSims/']) {
    const res = await page.goto(`/admin/${s}`);
    expect(res?.status(), s).toBe(200);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
