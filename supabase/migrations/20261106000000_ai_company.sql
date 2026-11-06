-- =====================================================================
-- WHITE CARRARA — azienda AI: agenti, incarichi, memoria, costi, approvazioni,
-- CRM, lead, mercati, marketing, pricing, certificazioni, ordini ai fornitori.
-- Da eseguire DOPO 20261101000000_init.sql. Rieseguibile.
-- Spiegazione: docs/AI-COMPANY.md
-- =====================================================================

-- Qualità del dato usata ovunque: verified | estimated | assumed | unknown
create or replace function public.valid_data_status(s text) returns boolean
language sql immutable as $$ select s in ('verified', 'estimated', 'assumed', 'unknown') $$;

-- ---------------------------------------------------------------------
-- Estensioni dei moduli commerciali esistenti
-- ---------------------------------------------------------------------
alter table public.suppliers add column if not exists verification_status text not null default 'unverified';
do $$ begin
  alter table public.suppliers add constraint suppliers_verification_chk check (verification_status in ('unverified', 'verified', 'rejected'));
exception when duplicate_object then null; end $$;

-- Disponibilità con prova: fonte, data del controllo, ricontrollo, documenti
alter table public.materials add column if not exists availability_source text;
alter table public.materials add column if not exists recheck_at timestamptz;
alter table public.materials add column if not exists evidence jsonb not null default '[]';
alter table public.materials add column if not exists price_source text;
alter table public.materials add column if not exists data_status text not null default 'unknown';
do $$ begin
  alter table public.materials add constraint materials_data_status_chk check (public.valid_data_status(data_status));
exception when duplicate_object then null; end $$;

-- Modo di evasione su preventivi, trattative e ordini
do $$
declare t text;
begin
  foreach t in array array['quotes', 'deals', 'orders'] loop
    execute format('alter table public.%I add column if not exists fulfilment_mode text', t);
    begin
      execute format('alter table public.%I add constraint %I check (fulfilment_mode in (''own_stock'', ''showroom_stock'', ''supplier_direct''))', t, t || '_fulfilment_chk');
    exception when duplicate_object then null; end;
  end loop;
end $$;
alter table public.orders add column if not exists supplier_confirmation_ref text;
alter table public.orders add column if not exists supplier_confirmed_at timestamptz;
alter table public.orders add column if not exists deposit_amount numeric(14, 2);

-- ---------------------------------------------------------------------
-- Agenti, incarichi, eventi, messaggi, memoria, costi, runtime
-- ---------------------------------------------------------------------
create table if not exists public.ai_agents (
  id text primary key,
  name text not null,
  department text not null,
  title text not null,
  enabled boolean not null default true,
  autonomy text not null default 'draft_and_analyze' check (autonomy in ('draft_and_analyze', 'disabled')),
  model text not null,
  effort text not null default 'medium' check (effort in ('low', 'medium', 'high', 'xhigh', 'max')),
  monthly_budget_usd numeric(10, 2) not null default 20 check (monthly_budget_usd >= 0),
  daily_task_limit int not null default 40 check (daily_task_limit >= 0),
  tools text[] not null default '{}',
  can_delegate_to text[] not null default '{}',
  objectives text[] not null default '{}',
  kpis jsonb not null default '[]',
  prompt_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.ai_settings (key, value) values
  ('monthly_revenue_target', '{"amount": 30000, "currency": "EUR", "note": "Obiettivo, non previsione"}'),
  ('daily_budget_usd', '{"amount": 25}'),
  ('max_delegation_depth', '{"value": 3}'),
  ('max_children_per_task', '{"value": 8}')
on conflict (key) do nothing;

create table if not exists public.ai_tasks (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.ai_tasks (id) on delete cascade,
  root_id uuid,
  agent_id text not null references public.ai_agents (id),
  title text not null check (char_length(title) between 3 and 300),
  instructions text not null check (char_length(instructions) between 1 and 20000),
  context jsonb not null default '{}',
  status text not null default 'queued'
    check (status in ('queued', 'running', 'waiting', 'completed', 'failed', 'cancelled', 'blocked')),
  wait_reason text check (wait_reason in ('children', 'dependencies', 'approval')),
  phase text not null default 'work' check (phase in ('work', 'synthesis')),
  priority int not null default 5 check (priority between 1 and 9),
  depends_on uuid[] not null default '{}',
  depth int not null default 0,
  attempts int not null default 0,
  max_attempts int not null default 3,
  run_after timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  activity text,
  result jsonb,
  result_summary text,
  error text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_by_agent text references public.ai_agents (id),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_tasks_queue_idx on public.ai_tasks (status, run_after, priority);
create index if not exists ai_tasks_parent_idx on public.ai_tasks (parent_id);
create index if not exists ai_tasks_agent_idx on public.ai_tasks (agent_id, created_at desc);
create index if not exists ai_tasks_root_idx on public.ai_tasks (root_id);

create table if not exists public.ai_task_events (
  id bigserial primary key,
  task_id uuid references public.ai_tasks (id) on delete cascade,
  agent_id text references public.ai_agents (id),
  kind text not null,
  activity text,
  message text,
  data jsonb not null default '{}',
  at timestamptz not null default now()
);
create index if not exists ai_task_events_at_idx on public.ai_task_events (at desc);
create index if not exists ai_task_events_task_idx on public.ai_task_events (task_id, id);

-- Note tra agenti: il destinatario le legge all'inizio del suo incarico successivo
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.ai_tasks (id) on delete set null,
  from_agent text references public.ai_agents (id),
  to_agent text not null references public.ai_agents (id),
  subject text not null,
  body text not null,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_to_idx on public.ai_messages (to_agent, read_at);

-- Memoria: individuale (agent_id) o aziendale condivisa (agent_id nullo)
create table if not exists public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id text references public.ai_agents (id) on delete cascade,
  topic text not null,
  content text not null check (char_length(content) <= 8000),
  data_status text not null default 'unknown' check (public.valid_data_status(data_status)),
  source text,
  task_id uuid references public.ai_tasks (id) on delete set null,
  pinned boolean not null default false,
  expires_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', coalesce(topic, '') || ' ' || content)) stored
);
create index if not exists ai_memory_agent_idx on public.ai_memory (agent_id, created_at desc);
create index if not exists ai_memory_search_idx on public.ai_memory using gin (search);

create table if not exists public.ai_usage (
  id bigserial primary key,
  agent_id text references public.ai_agents (id),
  task_id uuid references public.ai_tasks (id) on delete set null,
  model text not null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  web_searches int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  request_id text,
  at timestamptz not null default now()
);
create index if not exists ai_usage_agent_at_idx on public.ai_usage (agent_id, at desc);
create index if not exists ai_usage_at_idx on public.ai_usage (at desc);

-- Battito del servizio agenti: senza battito recente gli agenti risultano "non collegati"
create table if not exists public.ai_runtime (
  id text primary key,
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  version text,
  info jsonb not null default '{}'
);

create table if not exists public.ai_schedules (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.ai_agents (id),
  title text not null,
  instructions text not null,
  every_hours int not null check (every_hours between 1 and 2160),
  next_run_at timestamptz not null default now(),
  enabled boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Approvazioni del fondatore
-- ---------------------------------------------------------------------
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  number text unique default public.next_reference('A'),
  kind text not null check (kind in ('supplier_purchase', 'payment', 'contract', 'financial_commitment', 'binding_quote',
                                     'discount', 'stock_reservation', 'legal', 'outbound_message', 'other')),
  title text not null,
  summary text not null,
  payload jsonb not null default '{}',
  amount numeric(14, 2),
  currency text,
  requested_by_agent text references public.ai_agents (id),
  task_id uuid references public.ai_tasks (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'executed', 'failed')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  expires_at timestamptz,
  executed_at timestamptz,
  execution_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists approvals_status_idx on public.approvals (status, created_at desc);

-- ---------------------------------------------------------------------
-- Lead, CRM, opportunità, lista di esclusione
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  website text,
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  city text,
  segment text not null default 'other' check (segment in ('importer', 'distributor', 'architect', 'designer', 'fabricator',
                                                            'contractor', 'developer', 'hospitality', 'retailer', 'other')),
  contact_name text,
  contact_role text,
  email citext,
  phone text,
  source_url text,
  source_note text,
  retrieved_at timestamptz not null default now(),
  data_status text not null default 'unknown' check (public.valid_data_status(data_status)),
  qualification text not null default 'new' check (qualification in ('new', 'qualified', 'disqualified', 'contacted', 'converted')),
  score int check (score between 0 and 100),
  score_reason text,
  consent_status text not null default 'unknown' check (consent_status in ('unknown', 'legitimate_interest', 'opt_in', 'opted_out')),
  dedupe_key text not null unique,
  notes text,
  created_by_agent text references public.ai_agents (id),
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_country_idx on public.leads (country, segment);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  lead_id uuid references public.leads (id) on delete set null,
  customer_id uuid references public.profiles (id) on delete set null,
  stage text not null default 'new' check (stage in ('new', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  model text check (model in ('trading', 'brokerage')),
  estimated_value numeric(14, 2),
  currency text not null default 'EUR',
  value_status text not null default 'unknown' check (public.valid_data_status(value_status)),
  probability int check (probability between 0 and 100),
  expected_close date,
  next_step text,
  next_step_at timestamptz,
  owner_id uuid references public.profiles (id) on delete set null,
  created_by_agent text references public.ai_agents (id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id) on delete cascade,
  customer_id uuid references public.profiles (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  kind text not null check (kind in ('note', 'email', 'call', 'meeting', 'follow_up', 'task')),
  direction text check (direction in ('in', 'out')),
  subject text not null,
  body text,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  due_at timestamptz,
  done_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_by_agent text references public.ai_agents (id),
  created_at timestamptz not null default now()
);
create index if not exists crm_activities_lead_idx on public.crm_activities (lead_id, created_at desc);
create index if not exists crm_activities_due_idx on public.crm_activities (status, due_at);

create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  email citext unique,
  domain text unique,
  reason text not null,
  created_at timestamptz not null default now(),
  check (email is not null or domain is not null)
);

-- ---------------------------------------------------------------------
-- Export, marketing, pricing
-- ---------------------------------------------------------------------
create table if not exists public.market_analyses (
  id uuid primary key default gen_random_uuid(),
  country text not null check (country ~ '^[A-Z]{2}$'),
  title text not null,
  summary text not null,
  import_requirements text,
  documents text,
  logistics text,
  risks text,
  opportunity text,
  sources jsonb not null default '[]',
  data_status text not null default 'unknown' check (public.valid_data_status(data_status)),
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'archived')),
  created_by_agent text references public.ai_agents (id),
  task_id uuid references public.ai_tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('seo', 'content', 'campaign', 'email', 'catalog', 'ad', 'strategy')),
  title text not null,
  body text not null,
  lang text not null default 'it',
  channel text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'archived')),
  created_by_agent text references public.ai_agents (id),
  task_id uuid references public.ai_tasks (id) on delete set null,
  approval_id uuid references public.approvals (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_simulations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  model text not null check (model in ('resale', 'brokerage')),
  currency text not null default 'EUR',
  inputs jsonb not null,
  outputs jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_by_agent text references public.ai_agents (id),
  task_id uuid references public.ai_tasks (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Fornitori: certificazioni e ordini di acquisto; preventivi: versioni
-- ---------------------------------------------------------------------
create table if not exists public.supplier_certifications (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  name text not null,
  issuer text,
  number text,
  valid_until date,
  document_url text,
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number text unique default public.next_reference('P'),
  supplier_id uuid not null references public.suppliers (id),
  deal_id uuid references public.deals (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'sent', 'confirmed', 'cancelled')),
  lines jsonb not null default '[]',
  total numeric(14, 2),
  currency text not null default 'EUR',
  approval_id uuid references public.approvals (id) on delete set null,
  supplier_confirmation_ref text,
  confirmed_at timestamptz,
  notes text,
  created_by_agent text references public.ai_agents (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_by_agent text references public.ai_agents (id),
  created_at timestamptz not null default now(),
  unique (quote_id, version)
);

-- ---------------------------------------------------------------------
-- Team Executive & Professional Advisory: documenti di ingegneria gestionale, legali e fiscali.
-- I documenti legali e fiscali sono bozze di assistenti AI: revisione professionale obbligatoria.
-- ---------------------------------------------------------------------
alter table public.ai_agents add column if not exists team text;
-- automazioni proposte dagli agenti di processo: restano disattivate finché un amministratore non le attiva
alter table public.ai_schedules add column if not exists proposed_by_agent text references public.ai_agents (id);
alter table public.ai_schedules add column if not exists reason text;

create table if not exists public.advisory_documents (
  id uuid primary key default gen_random_uuid(),
  number text unique default public.next_reference('V'),
  category text not null check (category in ('operations', 'legal', 'tax')),
  kind text not null check (kind in ('process_map', 'procedure', 'kpi_definition', 'improvement_proposal', 'ops_report',
                                     'business_report', 'forecast', 'contract_review', 'contract_draft', 'legal_memo',
                                     'compliance_check', 'tax_analysis', 'vat_analysis', 'accounting_note',
                                     'cash_flow_forecast', 'tax_planning')),
  title text not null check (char_length(title) between 3 and 300),
  body text not null,
  jurisdiction text,
  applicable_law text,
  sources jsonb not null default '[]',
  points_to_verify text[] not null default '{}',
  figures jsonb not null default '[]',
  data_status text not null default 'unknown' check (public.valid_data_status(data_status)),
  review_required boolean not null default false,
  review_status text not null default 'not_required'
    check (review_status in ('not_required', 'required', 'in_review', 'approved', 'changes_requested', 'rejected')),
  reviewer_name text,
  reviewer_qualification text,
  review_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  related_type text,
  related_id uuid,
  status text not null default 'draft' check (status in ('draft', 'final', 'archived')),
  created_by_agent text references public.ai_agents (id),
  task_id uuid references public.ai_tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- legali e fiscali: sempre revisione professionale e punti da verificare
  constraint advisory_professional_chk check (category = 'operations' or (review_required and cardinality(points_to_verify) > 0)),
  constraint advisory_jurisdiction_chk check (category <> 'legal' or jurisdiction is not null),
  -- un documento diventa definitivo solo dopo la revisione approvata (o se la revisione non serve)
  constraint advisory_final_chk check (status <> 'final' or review_status in ('approved', 'not_required'))
);
create index if not exists advisory_documents_cat_idx on public.advisory_documents (category, created_at desc);

-- Parametri fiscali delle simulazioni: ipotesi modificabili dal pannello, non dati verificati
insert into public.ai_settings (key, value) values
  ('tax_parameters', '{"status": "assumed", "legal_form": "srl (ipotesi)", "vat_standard_rate": 22, "ires_rate": 24, "irap_rate": 3.9,
    "note": "Aliquote ordinarie usate solo per simulazioni. Regime, agevolazioni, base imponibile IRAP e scadenze vanno verificati con il commercialista."}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Notifiche al servizio agenti (LISTEN/NOTIFY): nuovi incarichi ed eventi in diretta
-- ---------------------------------------------------------------------
create or replace function public.ai_notify_task() returns trigger
language plpgsql as $$
begin
  perform pg_notify('ai_tasks', json_build_object('id', new.id, 'status', new.status, 'agent', new.agent_id)::text);
  return new;
end $$;
drop trigger if exists ai_tasks_notify on public.ai_tasks;
create trigger ai_tasks_notify after insert or update of status on public.ai_tasks
  for each row execute function public.ai_notify_task();

create or replace function public.ai_notify_event() returns trigger
language plpgsql as $$
begin
  perform pg_notify('ai_events', json_build_object('id', new.id, 'task', new.task_id, 'agent', new.agent_id, 'kind', new.kind,
                                                   'activity', new.activity, 'message', left(coalesce(new.message, ''), 300))::text);
  return new;
end $$;
drop trigger if exists ai_task_events_notify on public.ai_task_events;
create trigger ai_task_events_notify after insert on public.ai_task_events
  for each row execute function public.ai_notify_event();

-- ---------------------------------------------------------------------
-- updated_at e registro modifiche
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ai_agents', 'ai_tasks', 'ai_schedules', 'approvals', 'leads', 'opportunities', 'market_analyses',
                           'marketing_assets', 'purchase_orders', 'advisory_documents'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['ai_agents', 'ai_settings', 'ai_schedules', 'approvals', 'leads', 'opportunities', 'crm_activities',
                           'suppression_list', 'market_analyses', 'marketing_assets', 'pricing_simulations',
                           'supplier_certifications', 'purchase_orders', 'quote_versions', 'advisory_documents'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
--   permesso "ai": vedere la sede, assegnare incarichi, leggere risultati, costi e memoria
--   approvazioni: le vede chi ha "ai", le decide solo un amministratore (il fondatore)
--   il servizio agenti si collega come proprietario del database (fuori da RLS) e applica
--   nel codice i permessi di ogni agente (strumenti autorizzati)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ai_agents', 'ai_settings', 'ai_tasks', 'ai_task_events', 'ai_messages', 'ai_memory', 'ai_usage',
                           'ai_runtime', 'ai_schedules', 'approvals', 'leads', 'opportunities', 'crm_activities',
                           'suppression_list', 'market_analyses', 'marketing_assets', 'pricing_simulations',
                           'supplier_certifications', 'purchase_orders', 'quote_versions', 'advisory_documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to authenticated;

do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in
    ('ai_agents', 'ai_settings', 'ai_tasks', 'ai_task_events', 'ai_messages', 'ai_memory', 'ai_usage', 'ai_runtime', 'ai_schedules',
     'approvals', 'leads', 'opportunities', 'crm_activities', 'suppression_list', 'market_analyses', 'marketing_assets',
     'pricing_simulations', 'supplier_certifications', 'purchase_orders', 'quote_versions', 'advisory_documents') loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- agenti e impostazioni: letti da chi ha "ai", modificati solo dall'amministratore
create policy ai_agents_read on public.ai_agents for select to authenticated using (public.has_perm('ai'));
create policy ai_agents_admin on public.ai_agents for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ai_settings_read on public.ai_settings for select to authenticated using (public.has_perm('ai'));
create policy ai_settings_admin on public.ai_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- incarichi: chi ha "ai" li crea a proprio nome e può annullarli; esecuzione solo dal servizio
create policy ai_tasks_read on public.ai_tasks for select to authenticated using (public.has_perm('ai'));
create policy ai_tasks_create on public.ai_tasks for insert to authenticated
  with check (public.has_perm('ai') and created_by = auth.uid() and created_by_agent is null and status = 'queued' and parent_id is null);
create policy ai_tasks_update on public.ai_tasks for update to authenticated using (public.has_perm('ai')) with check (public.has_perm('ai'));

create policy ai_events_read on public.ai_task_events for select to authenticated using (public.has_perm('ai'));
create policy ai_messages_read on public.ai_messages for select to authenticated using (public.has_perm('ai'));
create policy ai_usage_read on public.ai_usage for select to authenticated using (public.has_perm('ai'));
create policy ai_runtime_read on public.ai_runtime for select to authenticated using (public.has_perm('ai'));
create policy ai_memory_read on public.ai_memory for select to authenticated using (public.has_perm('ai'));
create policy ai_memory_write on public.ai_memory for insert to authenticated with check (public.has_perm('ai') and created_by = auth.uid());
create policy ai_memory_delete on public.ai_memory for delete to authenticated using (public.is_admin());
create policy ai_schedules_read on public.ai_schedules for select to authenticated using (public.has_perm('ai'));
create policy ai_schedules_admin on public.ai_schedules for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy approvals_read on public.approvals for select to authenticated using (public.has_perm('ai') or public.is_admin());
create policy approvals_decide on public.approvals for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy leads_staff on public.leads for all to authenticated using (public.has_perm('customers')) with check (public.has_perm('customers'));
create policy leads_ai on public.leads for select to authenticated using (public.has_perm('ai'));
create policy opportunities_staff on public.opportunities for all to authenticated using (public.has_perm('customers')) with check (public.has_perm('customers'));
create policy opportunities_ai on public.opportunities for select to authenticated using (public.has_perm('ai'));
create policy crm_activities_staff on public.crm_activities for all to authenticated using (public.has_perm('customers')) with check (public.has_perm('customers'));
create policy suppression_staff on public.suppression_list for all to authenticated using (public.has_perm('customers')) with check (public.has_perm('customers'));

create policy market_analyses_read on public.market_analyses for select to authenticated using (public.has_perm('ai') or public.has_perm('trade'));
create policy market_analyses_write on public.market_analyses for all to authenticated using (public.has_perm('trade')) with check (public.has_perm('trade'));
create policy marketing_assets_read on public.marketing_assets for select to authenticated using (public.has_perm('ai') or public.has_perm('content'));
create policy marketing_assets_write on public.marketing_assets for all to authenticated using (public.has_perm('content')) with check (public.has_perm('content'));
create policy pricing_trade on public.pricing_simulations for all to authenticated using (public.has_perm('trade')) with check (public.has_perm('trade'));

create policy certifications_trade on public.supplier_certifications for all to authenticated using (public.has_perm('trade')) with check (public.has_perm('trade'));
create policy purchase_orders_trade on public.purchase_orders for all to authenticated using (public.has_perm('trade')) with check (public.has_perm('trade'));
create policy quote_versions_staff on public.quote_versions for all to authenticated
  using (public.has_perm('trade') or public.has_perm('customers')) with check (public.has_perm('trade') or public.has_perm('customers'));

-- Documenti del team advisory: quelli operativi a chi ha il permesso 'ai'; legali e fiscali solo agli
-- amministratori e a chi ha il permesso 'advisory' (per esempio l'avvocato o il commercialista che li rivede).
create policy advisory_read on public.advisory_documents for select to authenticated
  using (public.is_admin() or public.has_perm('advisory') or (category = 'operations' and public.has_perm('ai')));
create policy advisory_review on public.advisory_documents for update to authenticated
  using (public.is_admin() or public.has_perm('advisory')) with check (public.is_admin() or public.has_perm('advisory'));
create policy advisory_delete on public.advisory_documents for delete to authenticated using (public.is_admin());

-- i registri si scrivono solo dal servizio
revoke insert, update, delete on public.ai_task_events, public.ai_usage, public.ai_runtime, public.ai_messages from authenticated;

-- Un incarico risulta completato solo se lo ha eseguito il servizio agenti: dal pannello si può
-- soltanto annullare, rimettere in coda un incarico fallito o bloccato, cambiare la priorità.
create or replace function public.ai_tasks_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if (to_jsonb(new) - array['status', 'priority', 'attempts', 'run_after', 'error', 'updated_at', 'wait_reason'])
     is distinct from (to_jsonb(old) - array['status', 'priority', 'attempts', 'run_after', 'error', 'updated_at', 'wait_reason']) then
    raise exception 'Dal pannello si possono cambiare solo stato e priorità' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'cancelled' and old.status in ('queued', 'running', 'waiting', 'blocked') then
      new.finished_at := now();
    elsif new.status = 'queued' and old.status in ('failed', 'blocked') then
      new.attempts := 0;
      new.run_after := now();
      new.error := null;
      new.wait_reason := null;
    else
      raise exception 'Cambio di stato non consentito: % -> %', old.status, new.status using errcode = '42501';
    end if;
  elsif new.attempts is distinct from old.attempts or new.run_after is distinct from old.run_after or new.error is distinct from old.error then
    raise exception 'Operazione non consentita' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists ai_tasks_guard on public.ai_tasks;
create trigger ai_tasks_guard before update on public.ai_tasks for each row execute function public.ai_tasks_guard();

-- Dal pannello sui documenti advisory si registra solo la revisione (chi, qualifica, esito, nota) e lo stato.
create or replace function public.advisory_documents_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if (to_jsonb(new) - array['review_status', 'reviewer_name', 'reviewer_qualification', 'review_note', 'reviewed_by',
                            'reviewed_at', 'status', 'updated_at'])
     is distinct from (to_jsonb(old) - array['review_status', 'reviewer_name', 'reviewer_qualification', 'review_note',
                                             'reviewed_by', 'reviewed_at', 'status', 'updated_at']) then
    raise exception 'Si possono registrare solo la revisione e lo stato del documento' using errcode = '42501';
  end if;
  if new.review_status is distinct from old.review_status then
    if old.review_required and new.review_status = 'not_required' then
      raise exception 'La revisione professionale è obbligatoria per questo documento' using errcode = '42501';
    end if;
    if new.review_status in ('approved', 'changes_requested', 'rejected') then
      if coalesce(trim(new.reviewer_name), '') = '' then
        raise exception 'Indica chi ha fatto la revisione' using errcode = '23514';
      end if;
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists advisory_documents_guard on public.advisory_documents;
create trigger advisory_documents_guard before update on public.advisory_documents
  for each row execute function public.advisory_documents_guard();
