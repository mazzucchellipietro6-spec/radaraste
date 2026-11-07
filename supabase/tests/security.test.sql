-- Test della sicurezza del database (dopo 20261107000000_security.sql). npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000005a1', 'admin.sec@example.com'),
  ('00000000-0000-0000-0000-0000000005b1', 'staff.sec@example.com');
update public.profiles set role = 'admin' where email = 'admin.sec@example.com';
update public.profiles set role = 'staff', permissions = '{ai,trade,customers}' where email = 'staff.sec@example.com';
insert into public.leads (company_name, dedupe_key, email) values ('Lead sicurezza', 'lead-sicurezza|IT', 'buyer@example.com');
insert into public.payments (kind, ref_id, amount, stripe_session_id, url) values ('order', gen_random_uuid(), 100, 'cs_test_segreto', 'https://checkout.example');

create or replace function pg_temp.login(uid uuid, aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

-- S6: il registro è concatenato, solo in aggiunta, e la verifica rileva le alterazioni
do $$ begin
  assert (select ok from public.audit_verify()), 'catena del registro non valida';
  assert not exists (select 1 from public.audit_log where seq is null or row_hash is null), 'righe senza hash';
  begin
    update public.audit_log set actor = 'falso' where seq = (select max(seq) from public.audit_log);
    raise exception 'registro modificato';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.audit_log where seq = 1;
    raise exception 'registro cancellato';
  exception when insufficient_privilege then null; end;
end $$;
-- simulazione di un'alterazione diretta (proprietario che disattiva i controlli): la verifica la trova
savepoint manomissione;
alter table public.audit_log disable trigger audit_log_append_only;
update public.audit_log set actor = 'manomesso' where seq = 2;
do $$ begin
  assert not (select ok from public.audit_verify()), 'alterazione non rilevata';
  assert (select first_bad_seq from public.audit_verify()) = 2, 'riga alterata non individuata';
end $$;
rollback to savepoint manomissione;
-- cancellazione GDPR documentata: la catena resta valida e l'operazione è registrata
select public.audit_redact((select id::text from public.leads where dedupe_key = 'lead-sicurezza|IT'), 'richiesta di cancellazione');
do $$ begin
  assert (select ok from public.audit_verify()), 'catena non valida dopo la cancellazione GDPR';
  assert exists (select 1 from public.audit_log where action = 'redact'), 'cancellazione non registrata';
  assert not exists (select 1 from public.audit_log where changes::text like '%buyer@example.com%'), 'dato personale rimasto nel registro';
end $$;

-- S8: eventi di sicurezza visibili solo all'amministratore, non scrivibili dal pannello
insert into public.security_events (kind, severity, message) values ('login_failed', 'medium', 'Prova');
select pg_temp.login('00000000-0000-0000-0000-0000000005b1');
do $$ begin
  assert (select count(*) from public.security_events) = 0, 'lo staff vede gli eventi di sicurezza';
  begin
    insert into public.security_events (kind, message) values ('other', 'falso');
    raise exception 'lo staff scrive eventi di sicurezza';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000005a1');
update public.security_events set resolved = true where kind = 'login_failed';
do $$ begin
  assert (select resolved_by from public.security_events where kind = 'login_failed') = '00000000-0000-0000-0000-0000000005a1', 'gestione non registrata';
  begin
    update public.security_events set message = 'riscritto';
    raise exception 'evento di sicurezza riscritto';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- S7: il ruolo degli agenti vede solo ciò che serve
create role wc_agents_test_login login in role wc_agents_runtime;
set local role wc_agents_test_login;
do $$ begin
  assert (select count(*) from public.leads) >= 1, 'gli agenti non leggono i lead';
  begin
    perform 1 from public.profiles limit 1;
    raise exception 'gli agenti leggono i profili dei clienti';
  exception when insufficient_privilege then null; end;
  begin
    perform stripe_session_id from public.payments limit 1;
    raise exception 'gli agenti leggono gli identificativi Stripe';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.payments where amount = 100) = 1, 'gli agenti non leggono gli importi dei pagamenti';
  begin
    perform 1 from public.audit_log limit 1;
    raise exception 'gli agenti leggono il registro delle modifiche';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.leads;
    raise exception 'gli agenti cancellano lead';
  exception when insufficient_privilege then null; end;
  begin
    update public.ai_settings set value = '{}' where key = 'system_status';
    raise exception 'gli agenti cambiano le impostazioni';
  exception when insufficient_privilege then null; end;
end $$;
-- le modifiche fatte dagli agenti finiscono comunque nel registro (scritto dal trigger)
insert into public.leads (company_name, dedupe_key) values ('Lead da agente', 'lead-agente|IT');
reset role;
do $$ begin
  assert exists (select 1 from public.audit_log where table_name = 'leads' and changes ->> 'company_name' = 'Lead da agente'), 'modifica degli agenti non registrata';
  assert (select ok from public.audit_verify()), 'catena non valida dopo le scritture degli agenti';
end $$;

rollback;
\echo 'Sicurezza: tutti i controlli superati'
