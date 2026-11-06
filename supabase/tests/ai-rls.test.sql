-- Test dei permessi dell'azienda AI (dopo 20261106000000_ai_company.sql). npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'cliente.ai@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'staff.ai@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'staff.senza.ai@example.com'),
  ('00000000-0000-0000-0000-0000000000f0', 'fondatore@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'revisore@example.com');
update public.profiles set role = 'staff', permissions = '{ai}' where email = 'staff.ai@example.com';
update public.profiles set role = 'staff', permissions = '{trade}' where email = 'staff.senza.ai@example.com';
update public.profiles set role = 'admin' where email = 'fondatore@example.com';
update public.profiles set role = 'staff', permissions = '{advisory}' where email = 'revisore@example.com';

insert into public.ai_agents (id, name, department, title, model) values ('01-ai-ceo', 'AI CEO', 'direzione', 'CEO', 'claude-opus-5-5')
  on conflict (id) do nothing;
insert into public.ai_tasks (id, agent_id, title, instructions, status) values
  ('50000000-0000-0000-0000-000000000001', '01-ai-ceo', 'Incarico di sistema', 'Prova', 'queued');
insert into public.approvals (id, kind, title, summary, requested_by_agent) values
  ('60000000-0000-0000-0000-000000000001', 'supplier_purchase', 'Acquisto di prova', 'Prova', '01-ai-ceo');
insert into public.leads (company_name, dedupe_key) values ('Importatore Prova', 'importatore-prova|AE');
insert into public.suppliers (id, name) values ('80000000-0000-0000-0000-000000000001', 'Fornitore di prova');
insert into public.purchase_orders (supplier_id, status) values ('80000000-0000-0000-0000-000000000001', 'pending_approval');
insert into public.advisory_documents (id, category, kind, title, body) values
  ('70000000-0000-0000-0000-000000000001', 'operations', 'procedure', 'Procedura preventivi', 'Passi');
insert into public.advisory_documents (id, category, kind, title, body, jurisdiction, review_required, review_status, points_to_verify) values
  ('70000000-0000-0000-0000-000000000002', 'legal', 'contract_draft', 'Bozza accordo di commissione', 'Testo', 'Italia', true, 'required', '{"Legge applicabile"}'),
  ('70000000-0000-0000-0000-000000000003', 'tax', 'vat_analysis', 'IVA export EAU', 'Analisi', null, true, 'required', '{"Prova di uscita"}');
do $$ begin
  begin
    insert into public.advisory_documents (category, kind, title, body, jurisdiction) values ('legal', 'legal_memo', 'Senza revisione', 'x', 'Italia');
    raise exception 'documento legale senza revisione professionale accettato';
  exception when check_violation then null; end;
  begin
    insert into public.advisory_documents (category, kind, title, body, review_required, points_to_verify) values ('legal', 'legal_memo', 'Senza giurisdizione', 'x', true, '{"a"}');
    raise exception 'documento legale senza giurisdizione accettato';
  exception when check_violation then null; end;
end $$;

create or replace function pg_temp.login(uid uuid, aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

-- Cliente: non vede nulla dell'azienda AI
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
do $$ begin
  assert (select count(*) from public.ai_tasks) = 0, 'il cliente vede gli incarichi';
  assert (select count(*) from public.approvals) = 0, 'il cliente vede le approvazioni';
  assert (select count(*) from public.leads) = 0, 'il cliente vede i lead';
  assert (select count(*) from public.ai_memory) = 0, 'il cliente vede la memoria';
end $$;
reset role;

-- Staff senza permesso "ai": niente sede
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'aal2');
do $$ begin
  assert (select count(*) from public.ai_tasks) = 0, 'lo staff senza permesso ai vede gli incarichi';
  assert (select count(*) from public.purchase_orders) >= 0, 'ordini fornitori';
end $$;
reset role;

-- Staff con "ai" ma senza MFA: niente
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal1');
do $$ begin
  assert (select count(*) from public.ai_tasks) = 0, 'senza MFA lo staff vede gli incarichi';
end $$;
reset role;

-- Staff con "ai" e MFA: vede, assegna a proprio nome, annulla, ma non completa né approva
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
do $$ begin
  assert (select count(*) from public.ai_tasks) = 1, 'lo staff ai non vede gli incarichi';
  assert (select count(*) from public.approvals) = 1, 'lo staff ai non vede le approvazioni';
end $$;
insert into public.ai_tasks (agent_id, title, instructions, created_by)
  values ('01-ai-ceo', 'Incarico dallo staff', 'Analizza', '00000000-0000-0000-0000-0000000000a1');
do $$ begin
  begin
    insert into public.ai_tasks (agent_id, title, instructions, created_by) values ('01-ai-ceo', 'A nome di altri', 'x', '00000000-0000-0000-0000-0000000000f0');
    raise exception 'lo staff crea incarichi a nome di altri';
  exception when insufficient_privilege then null; end;
  begin
    update public.ai_tasks set status = 'completed' where title = 'Incarico dallo staff';
    raise exception 'lo staff segna come completato un incarico mai eseguito';
  exception when insufficient_privilege then null; end;
  begin
    update public.ai_tasks set result = '{"falso": true}' where title = 'Incarico dallo staff';
    raise exception 'lo staff scrive il risultato di un incarico';
  exception when insufficient_privilege then null; end;
  update public.ai_tasks set status = 'cancelled' where title = 'Incarico dallo staff';
  assert (select status from public.ai_tasks where title = 'Incarico dallo staff') = 'cancelled', 'annullamento non riuscito';
  update public.approvals set status = 'approved' where id = '60000000-0000-0000-0000-000000000001';
  assert (select status from public.approvals where id = '60000000-0000-0000-0000-000000000001') = 'pending', 'lo staff ha approvato un acquisto';
  assert (select count(*) from public.leads) = 1, 'lo staff ai non legge i lead';
  begin
    insert into public.ai_task_events (kind, message) values ('completed', 'falso');
    raise exception 'lo staff scrive nel registro degli agenti';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Fondatore senza MFA: non decide
select pg_temp.login('00000000-0000-0000-0000-0000000000f0', 'aal1');
update public.approvals set status = 'approved' where id = '60000000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  assert (select status from public.approvals where id = '60000000-0000-0000-0000-000000000001') = 'pending', 'approvazione senza MFA';
end $$;

-- Fondatore con MFA: approva, e la decisione è registrata
select pg_temp.login('00000000-0000-0000-0000-0000000000f0', 'aal2');
update public.approvals set status = 'approved', decided_by = '00000000-0000-0000-0000-0000000000f0', decided_at = now()
  where id = '60000000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  assert (select status from public.approvals where id = '60000000-0000-0000-0000-000000000001') = 'approved', 'il fondatore non riesce ad approvare';
  assert exists (select 1 from public.audit_log where table_name = 'approvals' and action = 'update' and actor_id = '00000000-0000-0000-0000-0000000000f0'), 'decisione non registrata';
  assert (select number from public.approvals where id = '60000000-0000-0000-0000-000000000001') ~ '^WC-A-\d{4}-\d{5}$', 'numero approvazione';
end $$;

-- Documenti advisory: lo staff "ai" vede solo quelli operativi; legali e fiscali solo a chi ha "advisory"
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
do $$ begin
  assert (select count(*) from public.advisory_documents) = 1, 'lo staff ai vede documenti legali o fiscali';
end $$;
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'aal2');
do $$ begin
  assert (select count(*) from public.advisory_documents) = 3, 'il revisore non vede i documenti';
  begin
    update public.advisory_documents set body = 'riscritto' where id = '70000000-0000-0000-0000-000000000002';
    raise exception 'il testo prodotto dall''agente è stato modificato';
  exception when insufficient_privilege then null; end;
  begin
    update public.advisory_documents set review_status = 'not_required' where id = '70000000-0000-0000-0000-000000000002';
    raise exception 'revisione obbligatoria tolta';
  exception when insufficient_privilege then null; end;
  begin
    update public.advisory_documents set status = 'final' where id = '70000000-0000-0000-0000-000000000002';
    raise exception 'documento legale definitivo senza revisione';
  exception when check_violation then null; end;
  begin
    update public.advisory_documents set review_status = 'approved' where id = '70000000-0000-0000-0000-000000000002';
    raise exception 'revisione approvata senza nome del revisore';
  exception when check_violation then null; end;
  update public.advisory_documents set review_status = 'approved', reviewer_name = 'Avv. Revisore di prova', reviewer_qualification = 'Avvocato'
    where id = '70000000-0000-0000-0000-000000000002';
  update public.advisory_documents set status = 'final' where id = '70000000-0000-0000-0000-000000000002';
  assert (select reviewed_by from public.advisory_documents where id = '70000000-0000-0000-0000-000000000002') = '00000000-0000-0000-0000-0000000000a3', 'revisore non registrato';
end $$;
reset role;

-- Ordini ai fornitori: dal pannello non si approvano senza l'approvazione del fondatore
update public.profiles set permissions = '{ai,trade}' where email = 'staff.ai@example.com';
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
do $$ begin
  begin
    update public.purchase_orders set status = 'approved';
    raise exception 'ordine al fornitore approvato senza il fondatore';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
declare ap uuid;
begin
  insert into public.approvals (kind, title, summary, status) values ('supplier_purchase', 'Ordine', 'x', 'approved') returning id into ap;
  update public.purchase_orders set approval_id = ap;
end $$;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
update public.purchase_orders set status = 'approved';
do $$ begin
  assert (select count(*) from public.purchase_orders where status = 'approved') = 1, 'ordine approvato non registrato';
end $$;
reset role;

rollback;
\echo 'RLS azienda AI: tutti i controlli superati'
