-- =====================================================================
-- WHITE CARRARA — sicurezza (audit Fase B, docs/AUDIT.md)
--   S6  registro delle modifiche solo in aggiunta e concatenato con hash
--   S7  ruolo database dedicato al servizio agenti (minimo privilegio)
--   S8  eventi di sicurezza
--   S10 sospensione immediata del sistema degli agenti
-- Da eseguire DOPO 20261101000000_init.sql e 20261106000000_ai_company.sql. Rieseguibile.
-- =====================================================================

-- ---------------------------------------------------------------------
-- S6 — registro delle modifiche a prova di alterazione
-- Ogni riga riceve un numero progressivo (seq) e l'hash SHA-256 del proprio contenuto concatenato con
-- l'hash della riga precedente: cambiare o togliere una riga rompe la catena e audit_verify() lo rileva.
-- Modifiche e cancellazioni sono vietate a tutti; l'unica eccezione documentata è la cancellazione dei
-- dati personali (GDPR) con audit_redact(), che ricalcola la catena e lascia traccia.
-- ---------------------------------------------------------------------
alter table public.audit_log add column if not exists seq bigint;
alter table public.audit_log add column if not exists prev_hash text;
alter table public.audit_log add column if not exists row_hash text;
create unique index if not exists audit_log_seq_idx on public.audit_log (seq);

create or replace function public.audit_payload(seq bigint, at timestamptz, actor_id uuid, actor text, action text,
                                                table_name text, row_id text, changes jsonb) returns text
language sql immutable as $$
  select concat_ws('|', seq::text, ((extract(epoch from at) * 1000000)::bigint)::text, coalesce(actor_id::text, ''),
                   coalesce(actor, ''), action, coalesce(table_name, ''), coalesce(row_id, ''), coalesce(changes::text, ''))
$$;

create or replace function public.audit_chain() returns trigger
language plpgsql security definer set search_path = public as $$
declare last record;
begin
  perform pg_advisory_xact_lock(hashtext('public.audit_log.chain'));
  select a.seq, a.row_hash into last from public.audit_log a where a.seq is not null order by a.seq desc limit 1;
  new.seq := coalesce(last.seq, 0) + 1;
  new.prev_hash := coalesce(last.row_hash, '');
  new.row_hash := encode(sha256(convert_to(new.prev_hash || '|' ||
    public.audit_payload(new.seq, new.at, new.actor_id, new.actor, new.action, new.table_name, new.row_id, new.changes), 'UTF8')), 'hex');
  return new;
end $$;

create or replace function public.audit_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_setting('app.audit_redaction', true) = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'Il registro delle modifiche non si modifica e non si cancella' using errcode = '42501';
end $$;

-- prima installazione: numerazione e catena per le righe già presenti
do $$
declare r record; h text := ''; prev text; n bigint := 0;
begin
  if exists (select 1 from public.audit_log where seq is null) then
    perform set_config('app.audit_redaction', 'on', true);
    for r in select * from public.audit_log order by (seq is null), seq, id loop
      n := n + 1;
      prev := h;
      h := encode(sha256(convert_to(prev || '|' || public.audit_payload(n, r.at, r.actor_id, r.actor, r.action, r.table_name, r.row_id, r.changes), 'UTF8')), 'hex');
      update public.audit_log set seq = n, prev_hash = prev, row_hash = h where id = r.id;
    end loop;
    perform set_config('app.audit_redaction', '', true);
  end if;
end $$;

drop trigger if exists audit_log_chain on public.audit_log;
create trigger audit_log_chain before insert on public.audit_log for each row execute function public.audit_chain();
drop trigger if exists audit_log_append_only on public.audit_log;
create trigger audit_log_append_only before update or delete on public.audit_log for each row execute function public.audit_append_only();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log for each statement execute function public.audit_append_only();

-- Verifica della catena: ok = true se nessuna riga è stata alterata o tolta
create or replace function public.audit_verify() returns table (ok boolean, checked bigint, first_bad_seq bigint, last_seq bigint, last_hash text)
language plpgsql stable security definer set search_path = public as $$
declare r record; h text := ''; n bigint := 0; expected bigint := 0;
begin
  for r in select * from public.audit_log order by seq loop
    expected := expected + 1;
    if r.seq <> expected or r.prev_hash is distinct from h then
      return query select false, n, r.seq, null::bigint, null::text; return;
    end if;
    h := encode(sha256(convert_to(h || '|' || public.audit_payload(r.seq, r.at, r.actor_id, r.actor, r.action, r.table_name, r.row_id, r.changes), 'UTF8')), 'hex');
    if h is distinct from r.row_hash then
      return query select false, n, r.seq, null::bigint, null::text; return;
    end if;
    n := n + 1;
  end loop;
  return query select true, n, null::bigint, expected, h;
end $$;
revoke execute on function public.audit_verify() from public, anon;
grant execute on function public.audit_verify() to authenticated;

-- Cancellazione dei dati personali (diritto all'oblio): toglie i dati dalle righe di una persona,
-- ricalcola la catena da quel punto e registra l'operazione. Solo il proprietario del database.
create or replace function public.audit_redact(p_row_id text, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare r record; h text; n bigint := 0; first bigint;
begin
  perform pg_advisory_xact_lock(hashtext('public.audit_log.chain'));
  perform set_config('app.audit_redaction', 'on', true);
  select min(seq) into first from public.audit_log where row_id = p_row_id or actor_id::text = p_row_id;
  if first is null then return 0; end if;
  update public.audit_log set changes = '{"redatto": true}'::jsonb, actor = case when actor_id::text = p_row_id then 'redatto' else actor end,
         actor_id = case when actor_id::text = p_row_id then null else actor_id end
   where row_id = p_row_id or actor_id::text = p_row_id;
  select row_hash into h from public.audit_log where seq = first - 1;
  h := coalesce(h, '');
  for r in select * from public.audit_log where seq >= first order by seq loop
    update public.audit_log set prev_hash = h,
      row_hash = encode(sha256(convert_to(h || '|' || public.audit_payload(r.seq, r.at, r.actor_id, r.actor, r.action, r.table_name, r.row_id, r.changes), 'UTF8')), 'hex')
     where seq = r.seq returning row_hash into h;
    n := n + 1;
  end loop;
  perform set_config('app.audit_redaction', '', true);
  insert into public.audit_log (actor, action, table_name, row_id, changes)
  values ('sistema:gdpr', 'redact', 'audit_log', p_row_id, jsonb_build_object('motivo', p_reason, 'righe_ricalcolate', n));
  return n;
end $$;
revoke execute on function public.audit_redact(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- S8 — eventi di sicurezza
-- ---------------------------------------------------------------------
create table if not exists public.security_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('login_failed', 'mfa_failed', 'rate_limited', 'access_denied', 'unauthorized_tool',
                                     'prompt_injection', 'kill_switch', 'agent_paused', 'budget_exceeded', 'config_change',
                                     'approval_decision', 'model_refusal', 'audit_chain_broken', 'other')),
  severity text not null default 'low' check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  source text not null default 'site' check (source in ('site', 'agents', 'database')),
  actor text,
  user_id uuid,
  ip_hash text,
  path text,
  message text not null,
  details jsonb not null default '{}',
  resolved boolean not null default false,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz
);
create index if not exists security_events_at_idx on public.security_events (at desc);
create index if not exists security_events_open_idx on public.security_events (resolved, severity);
alter table public.security_events enable row level security;
drop policy if exists security_events_read on public.security_events;
drop policy if exists security_events_resolve on public.security_events;
create policy security_events_read on public.security_events for select to authenticated using (public.is_admin());
create policy security_events_resolve on public.security_events for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, update on public.security_events to authenticated;
revoke insert, delete on public.security_events from authenticated;

-- dal pannello si segna solo come gestito: il resto dell'evento non cambia
create or replace function public.security_events_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if (to_jsonb(new) - array['resolved', 'resolved_by', 'resolved_at']) is distinct from (to_jsonb(old) - array['resolved', 'resolved_by', 'resolved_at']) then
    raise exception 'Di un evento di sicurezza si registra solo la gestione' using errcode = '42501';
  end if;
  new.resolved_by := case when new.resolved then auth.uid() else null end;
  new.resolved_at := case when new.resolved then now() else null end;
  return new;
end $$;
drop trigger if exists security_events_guard on public.security_events;
create trigger security_events_guard before update on public.security_events for each row execute function public.security_events_guard();

-- ---------------------------------------------------------------------
-- S10 — stato del sistema degli agenti (sospensione immediata)
-- ---------------------------------------------------------------------
insert into public.ai_settings (key, value) values
  ('system_status', '{"paused": false, "reason": null}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- S7 — ruolo del servizio agenti: accesso solo alle tabelle che usano i suoi strumenti.
-- Il servizio si collega con un utente che eredita questo ruolo (vedi docs/GO-LIVE.md):
--   create role wc_agents login password '<generata e salvata nel gestore dei segreti>' in role wc_agents_runtime;
-- Nessun accesso a profili dei clienti, autenticazione, limiti di frequenza, registro modifiche (scritto
-- dai trigger), traduzioni, documenti dei clienti, messaggi dei clienti.
-- ---------------------------------------------------------------------
do $$ begin create role wc_agents_runtime nologin; exception when duplicate_object then null; end $$;
grant usage on schema public to wc_agents_runtime;
grant usage, select on all sequences in schema public to wc_agents_runtime;
grant execute on function public.next_reference(text) to wc_agents_runtime;

do $$
declare
  t text;
  rw text[] := array['ai_agents', 'ai_tasks', 'ai_messages', 'ai_runtime', 'ai_schedules', 'approvals', 'leads', 'opportunities',
                     'marketing_assets', 'purchase_orders', 'quotes', 'quote_items', 'suppliers', 'requests', 'bookings',
                     'advisory_documents'];
  ins text[] := array['ai_task_events', 'ai_memory', 'ai_usage', 'crm_activities', 'market_analyses', 'pricing_simulations',
                      'quote_versions', 'email_log', 'security_events'];
  ro text[] := array['ai_settings', 'suppression_list', 'supplier_certifications', 'materials', 'deals', 'commissions',
                     'orders', 'shipments', 'tour_partners', 'booking_internal'];
begin
  foreach t in array rw || ins || ro loop
    execute format('drop policy if exists %I on public.%I', t || '_agents_runtime', t);
    execute format('create policy %I on public.%I for all to wc_agents_runtime using (true) with check (true)', t || '_agents_runtime', t);
  end loop;
  foreach t in array rw loop execute format('grant select, insert, update on public.%I to wc_agents_runtime', t); end loop;
  foreach t in array ins loop execute format('grant select, insert on public.%I to wc_agents_runtime', t); end loop;
  foreach t in array ro loop execute format('grant select on public.%I to wc_agents_runtime', t); end loop;
end $$;
-- il servizio legge i messaggi e segna quelli letti; toglie la propria riga di presenza alla chiusura
grant update (read_at) on public.ai_messages to wc_agents_runtime;
grant delete on public.ai_runtime to wc_agents_runtime;
grant update on public.ai_memory to wc_agents_runtime;
grant update (status, done_at) on public.crm_activities to wc_agents_runtime;
-- pagamenti: solo le colonne utili ai conti, non gli identificativi Stripe né i link di pagamento
drop policy if exists payments_agents_runtime on public.payments;
create policy payments_agents_runtime on public.payments for select to wc_agents_runtime using (true);
grant select (id, kind, ref_id, description, amount, currency, status, created_at, paid_at) on public.payments to wc_agents_runtime;
