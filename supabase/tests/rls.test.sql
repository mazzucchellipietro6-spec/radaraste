-- Test delle regole di sicurezza (RLS). Si eseguono su un database di prova:
--   npm run test:db   (vedi scripts/test-db.mjs)
-- Ogni controllo che fallisce interrompe lo script con un messaggio chiaro.
\set ON_ERROR_STOP on
begin;

-- Utenti di prova
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'cliente.a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'cliente.b@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'architetto@example.com'),
  ('00000000-0000-0000-0000-00000000005a', 'staff.commerciale@example.com'),
  ('00000000-0000-0000-0000-00000000005b', 'staff.turismo@example.com'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@example.com');
update public.profiles set b2b_status = 'approved', role = 'professional' where email = 'architetto@example.com';
update public.profiles set role = 'staff', permissions = '{trade,customers}' where email = 'staff.commerciale@example.com';
update public.profiles set role = 'staff', permissions = '{tours}' where email = 'staff.turismo@example.com';
update public.profiles set role = 'admin' where email = 'admin@example.com';

-- Dati di prova (inseriti come sistema)
insert into public.suppliers (id, name) values ('10000000-0000-0000-0000-000000000001', 'Fornitore riservato');
insert into public.materials (name, supplier_id, cost_price) values ('Lotto Statuario', '10000000-0000-0000-0000-000000000001', 123.45);
insert into public.requests (kind, user_id, email, message) values ('quote', '00000000-0000-0000-0000-00000000000a', 'cliente.a@example.com', 'Richiesta A');
insert into public.requests (kind, user_id, email, message) values ('quote', '00000000-0000-0000-0000-00000000000b', 'cliente.b@example.com', 'Richiesta B');
insert into public.quotes (id, customer_id, status) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'draft');
insert into public.quotes (id, customer_id, status) values ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'sent');
insert into public.quote_items (id, quote_id, description, quantity, unit_price) values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Statuario lucido 2 cm', 10, 100);
insert into public.quote_item_costs (quote_item_id, supplier_id, unit_cost) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 60);
insert into public.b2b_prices (marble_slug, price) values ('statuario', 999);
insert into public.bookings (id, kind, user_id, first_name, last_name, email) values ('40000000-0000-0000-0000-000000000001', 'experience', '00000000-0000-0000-0000-00000000000a', 'Anna', 'Rossi', 'cliente.a@example.com');
insert into public.booking_internal (booking_id, partner_cost) values ('40000000-0000-0000-0000-000000000001', 50);
insert into public.tour_partners (name) values ('Guida autorizzata');

-- Il totale del preventivo si calcola da solo
do $$ begin
  assert (select total from public.quotes where id = '20000000-0000-0000-0000-000000000002') = 1000, 'totale preventivo non aggiornato';
end $$;

-- Funzione di comodo: entra come un utente (aal1 = solo password, aal2 = con MFA)
create or replace function pg_temp.login(uid uuid, aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

-- ---------- Cliente A ----------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert (select count(*) from public.suppliers) = 0, 'il cliente vede i fornitori';
  assert (select count(*) from public.materials) = 0, 'il cliente vede i materiali dei fornitori';
  assert (select count(*) from public.quote_item_costs) = 0, 'il cliente vede i costi';
  assert (select count(*) from public.booking_internal) = 0, 'il cliente vede i dati interni della prenotazione';
  assert (select count(*) from public.tour_partners) = 0, 'il cliente vede i partner';
  assert (select count(*) from public.b2b_prices) = 0, 'il cliente non B2B vede i prezzi riservati';
  assert (select count(*) from public.requests) = 1, 'il cliente non vede solo le proprie richieste';
  assert (select count(*) from public.quotes) = 1, 'il cliente vede le bozze o i preventivi altrui';
  assert (select count(*) from public.quote_items) = 1, 'righe del preventivo non visibili al cliente';
  assert (select count(*) from public.bookings) = 1, 'prenotazioni del cliente non corrette';
  assert (select count(*) from public.profiles) = 1, 'il cliente vede altri profili';
  assert (select count(*) from public.audit_log) = 0, 'il cliente vede il registro delle modifiche';
end $$;
-- non può promuoversi
do $$ begin
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'il cliente ha cambiato il proprio ruolo';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set b2b_status = 'approved' where id = auth.uid();
    raise exception 'il cliente si è approvato come B2B';
  exception when insufficient_privilege then null; end;
end $$;
-- può aggiornare i propri dati e gestire preferiti e collezioni
update public.profiles set full_name = 'Anna Rossi' where id = auth.uid();
insert into public.favorites (user_id, marble_slug) values (auth.uid(), 'statuario');
insert into public.collections (user_id, name, items) values (auth.uid(), 'Bagno padronale', '{statuario}');
-- non può scrivere per conto di altri
do $$ begin
  begin
    insert into public.favorites (user_id, marble_slug) values ('00000000-0000-0000-0000-00000000000b', 'calacatta');
    raise exception 'il cliente ha scritto nei preferiti di un altro';
  exception when insufficient_privilege then null; end;
end $$;
-- accetta il preventivo inviato
select public.customer_respond_quote('20000000-0000-0000-0000-000000000002', true);
reset role;

-- ---------- Professionista B2B approvato ----------
select pg_temp.login('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert (select count(*) from public.b2b_prices) = 1, 'il professionista approvato non vede i prezzi riservati';
  assert (select count(*) from public.suppliers) = 0, 'il professionista vede i fornitori';
end $$;
reset role;

-- ---------- Staff commerciale senza MFA ----------
select pg_temp.login('00000000-0000-0000-0000-00000000005a', 'aal1');
do $$ begin
  assert (select count(*) from public.suppliers) = 0, 'lo staff senza MFA vede i fornitori';
  assert (select count(*) from public.requests) = 0, 'lo staff senza MFA vede le richieste';
end $$;
reset role;

-- ---------- Staff commerciale con MFA ----------
select pg_temp.login('00000000-0000-0000-0000-00000000005a', 'aal2');
do $$ begin
  assert (select count(*) from public.suppliers) = 1, 'lo staff commerciale non vede i fornitori';
  assert (select count(*) from public.quote_item_costs) = 1, 'lo staff commerciale non vede i costi';
  assert (select count(*) from public.requests) = 2, 'lo staff commerciale non vede tutte le richieste';
  assert (select count(*) from public.booking_internal) = 0, 'lo staff commerciale vede i dati interni del turismo';
end $$;
-- può approvare un professionista ma non cambiare ruoli
update public.profiles set b2b_status = 'approved' where email = 'cliente.b@example.com';
do $$ begin
  begin
    update public.profiles set role = 'admin' where email = 'cliente.b@example.com';
    raise exception 'lo staff ha cambiato un ruolo';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- Staff turismo con MFA ----------
select pg_temp.login('00000000-0000-0000-0000-00000000005b', 'aal2');
do $$ begin
  assert (select count(*) from public.suppliers) = 0, 'lo staff turismo vede i fornitori';
  assert (select count(*) from public.booking_internal) = 1, 'lo staff turismo non vede i dati interni';
  assert (select count(*) from public.tour_partners) = 1, 'lo staff turismo non vede i partner';
end $$;
reset role;

-- ---------- Amministratore con MFA ----------
select pg_temp.login('00000000-0000-0000-0000-0000000000ad', 'aal2');
do $$ begin
  assert (select count(*) from public.suppliers) = 1, 'l''amministratore non vede i fornitori';
  assert (select count(*) from public.audit_log) > 0, 'l''amministratore non vede il registro';
end $$;
update public.profiles set role = 'staff', permissions = '{content}' where email = 'cliente.b@example.com';
reset role;

-- ---------- Visitatore anonimo ----------
set local role anon;
do $$ begin
  begin
    perform count(*) from public.requests;
    raise exception 'un visitatore anonimo legge le richieste';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- Registro delle modifiche e limiti di frequenza ----------
do $$ begin
  assert exists (select 1 from public.audit_log where table_name = 'quotes' and action = 'update' and actor_id = '00000000-0000-0000-0000-00000000000a'), 'risposta al preventivo non registrata';
  assert exists (select 1 from public.audit_log where table_name = 'profiles' and actor_id = '00000000-0000-0000-0000-0000000000ad'), 'cambio di ruolo non registrato';
  assert public.rate_limit_hit('test', 60, 2) and public.rate_limit_hit('test', 60, 2) and not public.rate_limit_hit('test', 60, 2), 'limite di frequenza non rispettato';
  assert (select reference from public.requests limit 1) ~ '^WC-R-\d{4}-\d{5}$', 'formato del riferimento';
  assert (select margin_amount from (select 1000::numeric as s) x, lateral (select (1000 - 600 - 100 - 0)::numeric as margin_amount) y) = 300, 'calcolo';
end $$;
insert into public.deals (model, title, sale_amount, purchase_cost, logistics_cost, deal_value, commission_percent) values ('trading', 'Prova', 1000, 600, 100, 5000, 3);
do $$ begin
  assert (select margin_amount from public.deals where title = 'Prova') = 300, 'margine trading errato';
  assert (select commission_amount from public.deals where title = 'Prova') = 150, 'provvigione brokerage errata';
end $$;

rollback;
\echo 'RLS: tutti i controlli superati'
