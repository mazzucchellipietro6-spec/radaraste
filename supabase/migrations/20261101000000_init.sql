-- =====================================================================
-- WHITE CARRARA — schema del database (Supabase / PostgreSQL)
-- Esegui questo file nel SQL Editor di Supabase (oppure: supabase db push).
-- Spiegazione tabella per tabella: DATABASE.md
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------
-- Ruoli e permessi
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('customer', 'professional', 'staff', 'admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.b2b_status as enum ('none', 'pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null,
  full_name text,
  phone text,
  company text,
  vat_number text,
  country text,
  city text,
  nationality text,
  lang text not null default 'en',
  role public.user_role not null default 'customer',
  -- permessi dello staff: trade (fornitori, costi, trattative), tours (prenotazioni, partner),
  -- customers (clienti e richieste), content (traduzioni e contenuti)
  permissions text[] not null default '{}',
  b2b_status public.b2b_status not null default 'none',
  b2b_type text,
  b2b_website text,
  b2b_notes text,
  b2b_reviewed_at timestamptz,
  b2b_reviewed_by uuid references auth.users (id) on delete set null,
  marketing_opt_in boolean not null default false,
  privacy_accepted_at timestamptz,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_email_idx on public.profiles (email);

-- Chi sta facendo la richiesta (le funzioni leggono il token JWT di Supabase)
create or replace function public.jwt_aal() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal', 'aal1')
$$;

create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Staff e amministratori valgono solo con la verifica in due passaggi (MFA, livello aal2)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') and public.jwt_aal() = 'aal2'
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.jwt_aal() = 'aal2' and exists (
    select 1 from public.profiles
    where id = auth.uid() and (role = 'admin' or (role = 'staff' and p = any (permissions)))
  )
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.jwt_aal() = 'aal2' and exists (select 1 from public.profiles where id = auth.uid() and role in ('staff', 'admin'))
$$;

create or replace function public.is_b2b() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and b2b_status = 'approved') or public.is_staff()
$$;

-- ---------------------------------------------------------------------
-- Funzioni di servizio
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Numeri di riferimento leggibili: WC-R-2026-00001
create table if not exists public.counters (
  prefix text not null,
  year int not null,
  value int not null default 0,
  primary key (prefix, year)
);
create or replace function public.next_reference(p text) returns text
language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from now() at time zone 'Europe/Rome');
  v int;
begin
  insert into public.counters (prefix, year, value) values (p, y, 1)
  on conflict (prefix, year) do update set value = public.counters.value + 1
  returning value into v;
  return format('WC-%s-%s-%s', p, y, lpad(v::text, 5, '0'));
end $$;

-- Nuovo utente registrato -> profilo
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, lang)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'lang', ''), 'en')
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un cliente non può cambiarsi da solo ruolo, permessi o stato B2B
-- (security invoker: deve vedere il ruolo reale di chi modifica)
create or replace function public.protect_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if new.role is distinct from old.role or new.permissions is distinct from old.permissions or new.email is distinct from old.email then
      raise exception 'Operazione non consentita' using errcode = '42501';
    end if;
    if (new.b2b_status, new.b2b_reviewed_at, new.b2b_reviewed_by) is distinct from (old.b2b_status, old.b2b_reviewed_at, old.b2b_reviewed_by)
       and not public.has_perm('customers') then
      raise exception 'Operazione non consentita' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles for each row execute function public.protect_profile();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Registro delle modifiche (audit log)
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor text,
  action text not null,
  table_name text,
  row_id text,
  changes jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_row_idx on public.audit_log (table_name, row_id);

create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  diff jsonb;
  rid text;
begin
  if tg_op = 'DELETE' then
    diff := to_jsonb(old);
    rid := (to_jsonb(old) ->> 'id');
  elsif tg_op = 'INSERT' then
    diff := to_jsonb(new);
    rid := (to_jsonb(new) ->> 'id');
  else
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into diff
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key <> 'updated_at';
    if diff is null then return new; end if;
    rid := (to_jsonb(new) ->> 'id');
  end if;
  insert into public.audit_log (actor_id, actor, action, table_name, row_id, changes)
  values (auth.uid(), coalesce(nullif(current_setting('app.actor', true), ''), auth.jwt() ->> 'email', 'system'), lower(tg_op), tg_table_name, rid, diff);
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- Limiti di frequenza (condivisi tra tutte le istanze del sito)
-- ---------------------------------------------------------------------
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);
create or replace function public.rate_limit_hit(k text, window_seconds int, max_hits int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  c int;
begin
  insert into public.rate_limits (key, window_start, count) values (k, now(), 1)
  on conflict (key) do update set
    count = case when public.rate_limits.window_start < now() - make_interval(secs => window_seconds) then 1 else public.rate_limits.count + 1 end,
    window_start = case when public.rate_limits.window_start < now() - make_interval(secs => window_seconds) then now() else public.rate_limits.window_start end
  returning count into c;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  return c <= max_hits;
end $$;

-- ---------------------------------------------------------------------
-- Area clienti: preferiti, collezioni, progetti
-- ---------------------------------------------------------------------
create table if not exists public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  marble_slug text not null check (length(marble_slug) <= 120),
  created_at timestamptz not null default now(),
  primary key (user_id, marble_slug)
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  items text[] not null default '{}' check (cardinality(items) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists collections_user_idx on public.collections (user_id);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(name) between 1 and 160),
  type text,
  location text,
  description text check (length(description) <= 5000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'on_hold', 'completed', 'archived')),
  marbles text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_idx on public.projects (user_id);

-- ---------------------------------------------------------------------
-- CRM: richieste commerciali, preventivi, comunicazioni, documenti
-- ---------------------------------------------------------------------
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null default public.next_reference('R'),
  kind text not null check (kind in ('quote', 'concierge', 'matching', 'contact', 'b2b', 'tech_sheet', 'custom_trip', 'trade')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'waiting_customer', 'quoted', 'won', 'lost', 'closed', 'spam')),
  user_id uuid references public.profiles (id) on delete set null,
  name text,
  email citext,
  phone text,
  company text,
  country text,
  lang text,
  interest text,
  message text check (length(message) <= 8000),
  marbles text[] not null default '{}',
  details jsonb not null default '{}',
  assigned_to uuid references public.profiles (id) on delete set null,
  source text,
  privacy_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists requests_status_idx on public.requests (status, created_at desc);
create index if not exists requests_email_idx on public.requests (email);
create index if not exists requests_user_idx on public.requests (user_id);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  number text unique not null default public.next_reference('Q'),
  request_id uuid references public.requests (id) on delete set null,
  customer_id uuid references public.profiles (id) on delete set null,
  customer_name text,
  customer_email citext,
  customer_company text,
  model text not null default 'trading' check (model in ('trading', 'brokerage')),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled')),
  currency text not null default 'EUR',
  incoterm text,
  valid_until date,
  delivery_terms text,
  payment_terms text,
  notes text,
  total numeric(14, 2) not null default 0,
  deposit_percent numeric(5, 2) check (deposit_percent between 0 and 100),
  sent_at timestamptz,
  responded_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quotes_customer_idx on public.quotes (customer_id);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  position int not null default 0,
  marble_slug text,
  description text not null,
  finish text,
  thickness text,
  quantity numeric(14, 3) not null default 1 check (quantity >= 0),
  unit text not null default 'm2',
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  created_at timestamptz not null default now()
);
create index if not exists quote_items_quote_idx on public.quote_items (quote_id);

-- Totale del preventivo sempre coerente con le righe
create or replace function public.quote_total() returns trigger
language plpgsql security definer set search_path = public as $$
declare q uuid := coalesce(new.quote_id, old.quote_id);
begin
  update public.quotes set total = coalesce((select sum(round(quantity * unit_price, 2)) from public.quote_items where quote_id = q), 0) where id = q;
  return null;
end $$;
drop trigger if exists quote_items_total on public.quote_items;
create trigger quote_items_total after insert or update or delete on public.quote_items for each row execute function public.quote_total();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  thread_type text not null default 'general' check (thread_type in ('general', 'request', 'quote', 'booking', 'order', 'project')),
  thread_id uuid,
  sender text not null check (sender in ('customer', 'staff')),
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(body) between 1 and 8000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_customer_idx on public.messages (customer_id, created_at desc);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('customer', 'b2b', 'internal')),
  owner_id uuid references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  storage_path text not null,
  mime text,
  size_bytes bigint,
  marble_slug text,
  quote_id uuid references public.quotes (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists documents_owner_idx on public.documents (owner_id);

-- Prezzi riservati ai professionisti B2B approvati
create table if not exists public.b2b_prices (
  id uuid primary key default gen_random_uuid(),
  marble_slug text not null,
  finish text,
  thickness text,
  price numeric(14, 2) not null check (price >= 0),
  unit text not null default 'm2',
  currency text not null default 'EUR',
  valid_until date,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists b2b_prices_marble_idx on public.b2b_prices (marble_slug);

-- ---------------------------------------------------------------------
-- Commercio: fornitori, materiali, trattative (trading e brokerage), commissioni, ordini, spedizioni
-- Tutto riservato: visibile solo allo staff con permesso "trade"
-- ---------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  vat_number text,
  country text,
  city text,
  address text,
  contact_name text,
  email citext,
  phone text,
  website text,
  materials text[] not null default '{}',
  payment_terms text,
  notes text,
  rating smallint check (rating between 1 and 5),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  marble_slug text,
  name text not null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  kind text not null default 'slab' check (kind in ('block', 'slab', 'tile', 'cut_to_size', 'other')),
  lot_code text,
  finish text,
  thickness text,
  dimensions text,
  quantity numeric(14, 3),
  unit text default 'm2',
  cost_price numeric(14, 2),
  currency text not null default 'EUR',
  location text,
  availability text not null default 'to_verify' check (availability in ('to_verify', 'available', 'reserved', 'sold', 'unavailable')),
  verified_at date,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists materials_marble_idx on public.materials (marble_slug);

-- Costi e fornitore di ogni riga di preventivo (mai visibili al cliente)
create table if not exists public.quote_item_costs (
  quote_item_id uuid primary key references public.quote_items (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  material_id uuid references public.materials (id) on delete set null,
  unit_cost numeric(14, 2),
  commission_percent numeric(5, 2),
  notes text
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  number text unique not null default public.next_reference('D'),
  model text not null check (model in ('trading', 'brokerage')),
  title text not null,
  request_id uuid references public.requests (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  customer_id uuid references public.profiles (id) on delete set null,
  customer_name text,
  supplier_id uuid references public.suppliers (id) on delete set null,
  stage text not null default 'lead' check (stage in ('lead', 'negotiation', 'agreed', 'ordered', 'delivered', 'closed_won', 'closed_lost')),
  -- trading: vendita al cliente meno acquisto e costi = margine
  sale_amount numeric(14, 2),
  purchase_cost numeric(14, 2),
  logistics_cost numeric(14, 2),
  other_costs numeric(14, 2),
  margin_amount numeric(14, 2) generated always as (coalesce(sale_amount, 0) - coalesce(purchase_cost, 0) - coalesce(logistics_cost, 0) - coalesce(other_costs, 0)) stored,
  -- brokerage: valore dell'affare e provvigione concordata
  deal_value numeric(14, 2),
  commission_percent numeric(5, 2) check (commission_percent between 0 and 100),
  commission_amount numeric(14, 2) generated always as (round(coalesce(deal_value, 0) * coalesce(commission_percent, 0) / 100, 2)) stored,
  commission_payer text check (commission_payer in ('supplier', 'buyer', 'both')),
  agreement_ref text,
  currency text not null default 'EUR',
  expected_close date,
  notes text,
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deals_stage_idx on public.deals (model, stage);

create table if not exists public.deal_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'call', 'email', 'offer', 'counter_offer', 'meeting', 'stage')),
  body text not null,
  amount numeric(14, 2),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists deal_events_deal_idx on public.deal_events (deal_id, created_at);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  amount numeric(14, 2) not null,
  currency text not null default 'EUR',
  due_date date,
  status text not null default 'expected' check (status in ('expected', 'invoiced', 'paid', 'cancelled')),
  invoice_ref text,
  paid_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number text unique not null default public.next_reference('O'),
  deal_id uuid references public.deals (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  customer_id uuid references public.profiles (id) on delete set null,
  customer_name text,
  status text not null default 'confirmed' check (status in ('confirmed', 'in_production', 'ready', 'shipped', 'delivered', 'cancelled')),
  total numeric(14, 2),
  currency text not null default 'EUR',
  paid_amount numeric(14, 2) not null default 0,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid', 'refunded')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_customer_idx on public.orders (customer_id);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id) on delete cascade,
  carrier text,
  mode text check (mode in ('sea', 'road', 'air', 'rail')),
  incoterm text,
  origin text,
  destination text,
  container_ref text,
  tracking_ref text,
  tracking_url text,
  etd date,
  eta date,
  status text not null default 'planned' check (status in ('planned', 'booked', 'in_transit', 'delivered', 'issue')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shipments_order_idx on public.shipments (order_id);

-- ---------------------------------------------------------------------
-- Turismo: partner, prenotazioni (sempre su richiesta, confermate dallo staff), pagamenti
-- ---------------------------------------------------------------------
create table if not exists public.tour_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'guide' check (kind in ('guide', 'driver', 'transfer', 'quarry', 'workshop', 'sculptor', 'restaurant', 'winery', 'agency', 'boat', 'other')),
  license_info text,
  regions text[] not null default '{}',
  languages text[] not null default '{}',
  contact_name text,
  email citext,
  phone text,
  website text,
  notes text,
  verified_at date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null default public.next_reference('B'),
  kind text not null check (kind in ('experience', 'destination', 'custom_trip', 'transfer')),
  item_slug text,
  item_title text,
  user_id uuid references public.profiles (id) on delete set null,
  first_name text not null,
  last_name text not null,
  email citext not null,
  phone text,
  nationality text,
  lang text,
  preferred_date date,
  alternative_date date,
  participants int check (participants between 1 and 500),
  guide_language text,
  transfer boolean not null default false,
  transfer_details text,
  notes text check (length(notes) <= 5000),
  details jsonb not null default '{}',
  status text not null default 'requested' check (status in ('requested', 'checking', 'confirmed', 'awaiting_payment', 'paid', 'completed', 'declined', 'cancelled')),
  price numeric(14, 2),
  currency text not null default 'EUR',
  payment_url text,
  paid_at timestamptz,
  confirmed_at timestamptz,
  privacy_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bookings_status_idx on public.bookings (status, preferred_date);
create index if not exists bookings_user_idx on public.bookings (user_id);

-- Dati interni della prenotazione: partner assegnato e costo (mai visibili al cliente)
create table if not exists public.booking_internal (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  partner_id uuid references public.tour_partners (id) on delete set null,
  partner_cost numeric(14, 2),
  partner_confirmed_at timestamptz,
  notes text
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('booking', 'quote', 'order')),
  ref_id uuid not null,
  description text,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'EUR',
  stripe_session_id text unique,
  stripe_payment_intent text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'refunded', 'failed')),
  url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payments_ref_idx on public.payments (kind, ref_id);

-- Note interne generiche su qualsiasi elemento (clienti, richieste, preventivi...)
create table if not exists public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_id uuid not null,
  body text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists internal_notes_entity_idx on public.internal_notes (entity, entity_id);

-- ---------------------------------------------------------------------
-- Traduzioni modificate dall'amministratore e registro email
-- ---------------------------------------------------------------------
create table if not exists public.translation_overrides (
  id uuid primary key default gen_random_uuid(),
  lang text not null,
  key text not null,
  text text not null,
  active boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (lang, key)
);

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  to_email citext not null,
  subject text not null,
  template text not null,
  lang text,
  status text not null check (status in ('sent', 'skipped', 'failed')),
  provider_id text,
  error text,
  related_type text,
  related_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists email_log_at_idx on public.email_log (created_at desc);

-- ---------------------------------------------------------------------
-- updated_at e audit automatici
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['collections', 'projects', 'requests', 'quotes', 'b2b_prices', 'suppliers', 'materials', 'deals', 'commissions', 'orders', 'shipments', 'tour_partners', 'bookings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['profiles', 'requests', 'quotes', 'quote_items', 'quote_item_costs', 'b2b_prices', 'documents', 'suppliers', 'materials', 'deals', 'commissions', 'orders', 'shipments', 'tour_partners', 'bookings', 'booking_internal', 'payments', 'translation_overrides'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'counters', 'audit_log', 'rate_limits', 'favorites', 'collections', 'projects', 'requests', 'quotes', 'quote_items', 'messages', 'documents', 'b2b_prices', 'suppliers', 'materials', 'quote_item_costs', 'deals', 'deal_events', 'commissions', 'orders', 'shipments', 'tour_partners', 'bookings', 'booking_internal', 'payments', 'internal_notes', 'translation_overrides', 'email_log'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Nota: il proprietario delle tabelle (utente "postgres" usato dal server per le operazioni di sistema)
-- non è soggetto alla RLS; i visitatori e lo staff passano sempre dal ruolo "authenticated".

-- Pulizia delle regole precedenti (per poter rieseguire il file)
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profili
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.has_perm('customers'));
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid() or public.has_perm('customers')) with check (id = auth.uid() or public.has_perm('customers'));
create policy profiles_admin_delete on public.profiles for delete to authenticated using (public.is_admin());

-- dati personali del cliente
create policy favorites_own on public.favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy favorites_staff on public.favorites for select to authenticated using (public.has_perm('customers'));
create policy collections_own on public.collections for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy collections_staff on public.collections for select to authenticated using (public.has_perm('customers'));
create policy projects_own on public.projects for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy projects_staff on public.projects for all to authenticated using (public.has_perm('customers')) with check (public.has_perm('customers'));

-- richieste: il cliente vede le proprie; si creano solo dal server dopo i controlli antispam
create policy requests_own on public.requests for select to authenticated using (user_id = auth.uid());
create policy requests_staff on public.requests for all to authenticated using (public.has_perm('customers')) with check (public.has_perm('customers'));

-- preventivi: il cliente vede i propri, mai le bozze; le risposte passano da customer_respond_quote()
create policy quotes_own on public.quotes for select to authenticated using (customer_id = auth.uid() and status <> 'draft');
create policy quotes_staff on public.quotes for all to authenticated using (public.has_perm('customers') or public.has_perm('trade')) with check (public.has_perm('customers') or public.has_perm('trade'));
create policy quote_items_own on public.quote_items for select to authenticated using (exists (select 1 from public.quotes q where q.id = quote_id and q.customer_id = auth.uid() and q.status <> 'draft'));
create policy quote_items_staff on public.quote_items for all to authenticated using (public.has_perm('customers') or public.has_perm('trade')) with check (public.has_perm('customers') or public.has_perm('trade'));

-- comunicazioni
create policy messages_own_select on public.messages for select to authenticated using (customer_id = auth.uid());
create policy messages_own_insert on public.messages for insert to authenticated with check (customer_id = auth.uid() and sender = 'customer' and sender_id = auth.uid());
create policy messages_staff on public.messages for all to authenticated using (public.has_perm('customers')) with check (public.has_perm('customers'));

-- documenti
create policy documents_read on public.documents for select to authenticated using (
  (scope = 'customer' and owner_id = auth.uid()) or (scope = 'b2b' and public.is_b2b()) or public.is_staff()
);
create policy documents_staff on public.documents for all to authenticated using (public.has_perm('customers') or public.has_perm('trade')) with check (public.has_perm('customers') or public.has_perm('trade'));

-- prezzi riservati B2B
create policy b2b_prices_read on public.b2b_prices for select to authenticated using (active and public.is_b2b());
create policy b2b_prices_staff on public.b2b_prices for all to authenticated using (public.has_perm('trade')) with check (public.has_perm('trade'));

-- area commerciale riservata
create policy suppliers_trade on public.suppliers for all to authenticated using (public.has_perm('trade')) with check (public.has_perm('trade'));
create policy materials_trade on public.materials for all to authenticated using (public.has_perm('trade')) with check (public.has_perm('trade'));
create policy quote_item_costs_trade on public.quote_item_costs for all to authenticated using (public.has_perm('trade')) with check (public.has_perm('trade'));
create policy deals_trade on public.deals for all to authenticated using (public.has_perm('trade')) with check (public.has_perm('trade'));
create policy deal_events_trade on public.deal_events for all to authenticated using (public.has_perm('trade')) with check (public.has_perm('trade'));
create policy commissions_trade on public.commissions for all to authenticated using (public.has_perm('trade')) with check (public.has_perm('trade'));

-- ordini e spedizioni: il cliente vede i propri
create policy orders_own on public.orders for select to authenticated using (customer_id = auth.uid());
create policy orders_staff on public.orders for all to authenticated using (public.has_perm('trade') or public.has_perm('customers')) with check (public.has_perm('trade') or public.has_perm('customers'));
create policy shipments_own on public.shipments for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy shipments_staff on public.shipments for all to authenticated using (public.has_perm('trade') or public.has_perm('customers')) with check (public.has_perm('trade') or public.has_perm('customers'));

-- turismo
create policy tour_partners_staff on public.tour_partners for all to authenticated using (public.has_perm('tours')) with check (public.has_perm('tours'));
create policy bookings_own on public.bookings for select to authenticated using (user_id = auth.uid());
create policy bookings_staff on public.bookings for all to authenticated using (public.has_perm('tours')) with check (public.has_perm('tours'));
create policy booking_internal_staff on public.booking_internal for all to authenticated using (public.has_perm('tours')) with check (public.has_perm('tours'));
create policy payments_staff on public.payments for all to authenticated using (public.has_perm('tours') or public.has_perm('trade')) with check (public.has_perm('tours') or public.has_perm('trade'));

-- note interne, traduzioni, email, audit
create policy internal_notes_staff on public.internal_notes for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy translations_read on public.translation_overrides for select to anon, authenticated using (active);
create policy translations_staff on public.translation_overrides for all to authenticated using (public.has_perm('content')) with check (public.has_perm('content'));
create policy email_log_staff on public.email_log for select to authenticated using (public.is_staff());
create policy audit_admin on public.audit_log for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Privilegi: niente accesso anonimo ai dati, solo alle traduzioni pubblicate
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select on public.translation_overrides to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_log, public.counters, public.rate_limits, public.email_log from authenticated;
revoke all on public.counters, public.rate_limits from authenticated;
revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
revoke execute on function public.next_reference(text) from public, anon;
grant execute on function public.next_reference(text) to authenticated;

-- Il cliente accetta o rifiuta un preventivo inviato a lui
create or replace function public.customer_respond_quote(q uuid, accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  update public.quotes
     set status = case when accept then 'accepted' else 'rejected' end, responded_at = now()
   where id = q and customer_id = auth.uid() and status = 'sent'
     and (valid_until is null or valid_until >= current_date)
  returning status into st;
  if st is null then raise exception 'Preventivo non disponibile' using errcode = 'P0002'; end if;
  return st;
end $$;
revoke execute on function public.customer_respond_quote(uuid, boolean) from public, anon;
grant execute on function public.customer_respond_quote(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Archivio file (Supabase Storage): documenti privati, accesso solo con link firmati generati dal server
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
  end if;
end $$;
