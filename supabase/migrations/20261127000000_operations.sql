-- =====================================================================
-- WHITE CARRARA — operatività dei 25 agenti (Fasi C/D)
--   5 divisioni; fornitori e partner dei tour; offerte; catalogo dei servizi; itinerari; campagne;
--   prenotazioni preparate dagli agenti; politica di autonomia con soglie; approvazioni con
--   motivazione, rischio ed effetti; report giornalieri dell'AI CEO; avvisi al proprietario.
-- Da eseguire DOPO 20261107000000_security.sql. Rieseguibile.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Divisioni
-- ---------------------------------------------------------------------
alter table public.ai_agents add column if not exists division text;
do $$ begin
  alter table public.ai_agents add constraint ai_agents_division_chk
    check (division is null or division in ('executive', 'procurement', 'marketing', 'sales', 'operations', 'finance'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Approvazioni: nuovi tipi e informazioni per decidere
-- ---------------------------------------------------------------------
alter table public.approvals drop constraint if exists approvals_kind_check;
alter table public.approvals add constraint approvals_kind_check check (kind in (
  'supplier_purchase', 'payment', 'contract', 'financial_commitment', 'binding_quote', 'discount', 'stock_reservation',
  'legal', 'outbound_message', 'binding_conditions', 'booking_commitment', 'price_change', 'campaign_activation',
  'sensitive_data', 'irreversible', 'other'));
alter table public.approvals add column if not exists reason text;
alter table public.approvals add column if not exists effects text;
alter table public.approvals add column if not exists risk_level text not null default 'medium';
do $$ begin
  alter table public.approvals add constraint approvals_risk_chk check (risk_level in ('low', 'medium', 'high', 'critical'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Politica di autonomia: ciò che gli agenti fanno da soli e le soglie oltre cui serve il proprietario
-- ---------------------------------------------------------------------
insert into public.ai_settings (key, value) values
  ('autonomy_policy', '{
     "followup_auto_send": true,
     "followup_daily_cap": 20,
     "followup_min_days_between": 3,
     "min_margin_rate": 15,
     "max_margin_rate": 70,
     "max_price_change_rate": 10,
     "max_discount_rate": 5,
     "campaign_auto_budget_eur": 0,
     "booking_auto_commitment_eur": 0,
     "note": "Soglie modificabili dal proprietario. 0 significa: serve sempre l''approvazione."
   }')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Offerte dei fornitori e dei partner (registrate da documenti, email o pagine pubbliche)
-- ---------------------------------------------------------------------
create table if not exists public.supplier_offers (
  id uuid primary key default gen_random_uuid(),
  number text unique default public.next_reference('F'),
  supplier_id uuid references public.suppliers (id) on delete set null,
  partner_id uuid references public.tour_partners (id) on delete set null,
  kind text not null default 'other' check (kind in ('material', 'tour_service', 'transfer', 'accommodation', 'guide', 'experience', 'other')),
  subject text not null,
  unit_cost numeric(14, 2) check (unit_cost >= 0),
  unit text not null default 'servizio',
  currency text not null default 'EUR',
  min_quantity numeric(14, 3),
  valid_until date,
  conditions text,
  payment_terms text,
  source text not null,
  source_url text,
  data_status text not null default 'unknown' check (public.valid_data_status(data_status)),
  status text not null default 'received' check (status in ('received', 'analyzed', 'pending_approval', 'accepted', 'rejected', 'expired')),
  analysis text,
  approval_id uuid references public.approvals (id) on delete set null,
  created_by_agent text references public.ai_agents (id),
  task_id uuid references public.ai_tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (supplier_id is not null or partner_id is not null)
);

-- ---------------------------------------------------------------------
-- Catalogo interno dei servizi vendibili (tour, esperienze, transfer, prodotti in marmo)
-- ---------------------------------------------------------------------
create table if not exists public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  code text unique default public.next_reference('S'),
  kind text not null check (kind in ('tour', 'experience', 'transfer', 'marble_product', 'other')),
  title text not null,
  description text,
  offer_id uuid references public.supplier_offers (id) on delete set null,
  partner_id uuid references public.tour_partners (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  unit text not null default 'persona',
  cost numeric(14, 2) check (cost >= 0),
  price numeric(14, 2) check (price >= 0),
  currency text not null default 'EUR',
  margin_rate numeric(7, 2) generated always as (case when price > 0 and cost is not null then round((price - cost) / price * 100, 2) end) stored,
  price_status text not null default 'unknown' check (public.valid_data_status(price_status)),
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'active', 'retired')),
  approval_id uuid references public.approvals (id) on delete set null,
  created_by_agent text references public.ai_agents (id),
  task_id uuid references public.ai_tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Itinerari personalizzati
-- ---------------------------------------------------------------------
create table if not exists public.itineraries (
  id uuid primary key default gen_random_uuid(),
  number text unique default public.next_reference('I'),
  lead_id uuid references public.leads (id) on delete set null,
  request_id uuid references public.requests (id) on delete set null,
  customer_name text,
  title text not null,
  start_date date,
  days int check (days between 1 and 60),
  participants int check (participants between 1 and 500),
  items jsonb not null default '[]',
  total_cost numeric(14, 2),
  total_price numeric(14, 2),
  currency text not null default 'EUR',
  price_status text not null default 'unknown' check (public.valid_data_status(price_status)),
  status text not null default 'draft' check (status in ('draft', 'proposed', 'accepted', 'cancelled')),
  quote_id uuid references public.quotes (id) on delete set null,
  notes text,
  created_by_agent text references public.ai_agents (id),
  task_id uuid references public.ai_tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Campagne pubblicitarie (preparate dagli agenti; spesa solo dopo approvazione oltre la soglia)
-- ---------------------------------------------------------------------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  number text unique default public.next_reference('C'),
  title text not null,
  platform text not null,
  objective text not null,
  audience text,
  countries text[] not null default '{}',
  budget_daily numeric(12, 2) not null default 0 check (budget_daily >= 0),
  budget_total numeric(12, 2) not null default 0 check (budget_total >= 0),
  currency text not null default 'EUR',
  start_date date,
  end_date date,
  asset_id uuid references public.marketing_assets (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'active', 'paused', 'ended', 'rejected')),
  approval_id uuid references public.approvals (id) on delete set null,
  kpis jsonb not null default '{}',
  spent numeric(12, 2) not null default 0,
  created_by_agent text references public.ai_agents (id),
  task_id uuid references public.ai_tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Report giornalieri (misure calcolate dal servizio + sintesi dell'AI CEO) e avvisi al proprietario
-- ---------------------------------------------------------------------
create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  metrics jsonb not null default '{}',
  narrative text,
  ceo_task_id uuid references public.ai_tasks (id) on delete set null,
  audit_anchor jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.owner_alerts (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  severity text not null default 'medium' check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  title text not null,
  body text not null,
  agent_id text references public.ai_agents (id),
  task_id uuid references public.ai_tasks (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'seen', 'closed')),
  seen_by uuid references public.profiles (id) on delete set null,
  seen_at timestamptz
);
create index if not exists owner_alerts_open_idx on public.owner_alerts (status, at desc);

-- prenotazioni preparate dagli agenti
alter table public.bookings add column if not exists itinerary_id uuid references public.itineraries (id) on delete set null;
alter table public.bookings add column if not exists created_by_agent text references public.ai_agents (id);

-- ---------------------------------------------------------------------
-- Registro, aggiornamento automatico, RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['supplier_offers', 'service_catalog', 'itineraries', 'campaigns', 'daily_reports'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['supplier_offers', 'service_catalog', 'itineraries', 'campaigns', 'owner_alerts'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit()', t || '_audit', t);
  end loop;
  foreach t in array array['supplier_offers', 'service_catalog', 'itineraries', 'campaigns', 'daily_reports', 'owner_alerts'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

drop policy if exists supplier_offers_trade on public.supplier_offers;
drop policy if exists service_catalog_trade on public.service_catalog;
drop policy if exists service_catalog_ai on public.service_catalog;
drop policy if exists itineraries_staff on public.itineraries;
drop policy if exists campaigns_content on public.campaigns;
drop policy if exists campaigns_ai on public.campaigns;
drop policy if exists daily_reports_read on public.daily_reports;
drop policy if exists owner_alerts_admin on public.owner_alerts;
create policy supplier_offers_trade on public.supplier_offers for all to authenticated using (public.has_perm('trade')) with check (public.has_perm('trade'));
create policy service_catalog_trade on public.service_catalog for all to authenticated using (public.has_perm('trade')) with check (public.has_perm('trade'));
create policy service_catalog_ai on public.service_catalog for select to authenticated using (public.has_perm('ai') or public.has_perm('tours'));
create policy itineraries_staff on public.itineraries for all to authenticated
  using (public.has_perm('tours') or public.has_perm('customers')) with check (public.has_perm('tours') or public.has_perm('customers'));
create policy campaigns_content on public.campaigns for all to authenticated using (public.has_perm('content')) with check (public.has_perm('content'));
create policy campaigns_ai on public.campaigns for select to authenticated using (public.has_perm('ai'));
create policy daily_reports_read on public.daily_reports for select to authenticated using (public.has_perm('ai'));
create policy owner_alerts_admin on public.owner_alerts for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.supplier_offers, public.service_catalog, public.itineraries, public.campaigns to authenticated;
grant select on public.daily_reports to authenticated;
grant select, update on public.owner_alerts to authenticated;

-- ruolo del servizio agenti: accesso alle nuove tabelle e scrittura su partner e costi delle prenotazioni
do $$
declare t text;
begin
  foreach t in array array['supplier_offers', 'service_catalog', 'itineraries', 'campaigns', 'daily_reports', 'owner_alerts',
                           'tour_partners', 'booking_internal'] loop
    execute format('drop policy if exists %I on public.%I', t || '_agents_runtime', t);
    execute format('create policy %I on public.%I for all to wc_agents_runtime using (true) with check (true)', t || '_agents_runtime', t);
    execute format('grant select, insert, update on public.%I to wc_agents_runtime', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Impegni economici: né il pannello né gli agenti possono confermare una prenotazione preparata da un
-- agente, attivare una campagna con budget o accettare condizioni vincolanti senza un'approvazione
-- del proprietario registrata. Le prenotazioni dei clienti gestite dallo staff restano come prima.
-- ---------------------------------------------------------------------
create or replace function public.approved(p_kind text, p_key text, p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.approvals a where a.kind = p_kind and a.status in ('approved', 'executed')
                 and a.payload ->> p_key = p_id::text)
$$;

create or replace function public.bookings_commitment_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.created_by_agent is not null and new.status in ('confirmed', 'awaiting_payment', 'paid', 'completed')
     and (tg_op = 'INSERT' or old.status not in ('confirmed', 'awaiting_payment', 'paid', 'completed'))
     and not public.approved('booking_commitment', 'booking_id', new.id) then
    raise exception 'Una prenotazione preparata da un agente si conferma solo dopo l''approvazione del proprietario' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists bookings_commitment_guard on public.bookings;
create trigger bookings_commitment_guard before insert or update on public.bookings for each row execute function public.bookings_commitment_guard();

create or replace function public.campaigns_guard() returns trigger
language plpgsql set search_path = public as $$
declare auto numeric := coalesce(((select value from public.ai_settings where key = 'autonomy_policy') ->> 'campaign_auto_budget_eur')::numeric, 0);
begin
  if new.status in ('approved', 'active') and (tg_op = 'INSERT' or old.status not in ('approved', 'active'))
     and greatest(new.budget_total, new.budget_daily) > auto and not public.approved('campaign_activation', 'campaign_id', new.id) then
    raise exception 'Una campagna con budget oltre la soglia si attiva solo dopo l''approvazione del proprietario' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists campaigns_guard on public.campaigns;
create trigger campaigns_guard before insert or update on public.campaigns for each row execute function public.campaigns_guard();

create or replace function public.offers_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status <> 'accepted') and not public.approved('binding_conditions', 'offer_id', new.id) then
    raise exception 'Le condizioni di un fornitore si accettano solo dopo l''approvazione del proprietario' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists supplier_offers_guard on public.supplier_offers;
create trigger supplier_offers_guard before insert or update on public.supplier_offers for each row execute function public.offers_guard();

-- prezzi del catalogo: fuori dalle soglie di margine o di variazione, attivazione solo con approvazione
create or replace function public.service_catalog_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  pol jsonb := (select value from public.ai_settings where key = 'autonomy_policy');
  m numeric := case when new.price > 0 and new.cost is not null then (new.price - new.cost) / new.price * 100 end;
  outside boolean;
begin
  if new.status <> 'active' then return new; end if;
  outside := m is null or m < coalesce((pol ->> 'min_margin_rate')::numeric, 15) or m > coalesce((pol ->> 'max_margin_rate')::numeric, 70)
    or (tg_op = 'UPDATE' and old.status = 'active' and old.price > 0
        and abs(new.price - old.price) / old.price * 100 > coalesce((pol ->> 'max_price_change_rate')::numeric, 10));
  if outside and not public.approved('price_change', 'service_id', new.id) then
    raise exception 'Prezzo fuori dai limiti autorizzati: serve l''approvazione del proprietario' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists service_catalog_guard on public.service_catalog;
create trigger service_catalog_guard before insert or update on public.service_catalog for each row execute function public.service_catalog_guard();
revoke execute on function public.approved(text, text, uuid) from public, anon;
grant execute on function public.approved(text, text, uuid) to authenticated, wc_agents_runtime;
-- il servizio agenti registra nel report giornaliero l'ultimo anello della catena del registro (ancoraggio)
grant execute on function public.audit_verify() to wc_agents_runtime;

-- soglia di autonomia per le prenotazioni: sotto booking_auto_commitment_eur (se maggiore di 0) la conferma
-- non richiede approvazione; il valore predefinito 0 la richiede sempre
create or replace function public.bookings_commitment_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  auto numeric := coalesce(((select value from public.ai_settings where key = 'autonomy_policy') ->> 'booking_auto_commitment_eur')::numeric, 0);
  cost numeric := (select partner_cost from public.booking_internal where booking_id = new.id);
begin
  if new.created_by_agent is not null and new.status in ('confirmed', 'awaiting_payment', 'paid', 'completed')
     and (tg_op = 'INSERT' or old.status not in ('confirmed', 'awaiting_payment', 'paid', 'completed'))
     and not (auto > 0 and cost is not null and cost <= auto)
     and not public.approved('booking_commitment', 'booking_id', new.id) then
    raise exception 'Una prenotazione preparata da un agente si conferma solo dopo l''approvazione del proprietario' using errcode = '42501';
  end if;
  return new;
end $$;
