-- Test dell'operatività degli agenti (dopo 20261127000000_operations.sql). npm run test:db
\set ON_ERROR_STOP on
begin;
create role wc_agents_ops_login login in role wc_agents_runtime;
insert into public.ai_agents (id, name, department, title, model) values ('15-order-manager', 'Order Manager', 'operazioni', 'x', 'claude-opus-5-5')
  on conflict (id) do nothing;
insert into public.tour_partners (id, name, kind) values ('91000000-0000-0000-0000-000000000001', 'Guida di prova', 'guide');

set local role wc_agents_ops_login;
-- l'agente prepara una prenotazione ma non può confermarla senza approvazione
insert into public.bookings (id, kind, first_name, last_name, email, status, created_by_agent)
  values ('92000000-0000-0000-0000-000000000001', 'experience', 'Mario', 'Rossi', 'mario@example.com', 'checking', '15-order-manager');
do $$ begin
  begin
    update public.bookings set status = 'confirmed' where id = '92000000-0000-0000-0000-000000000001';
    raise exception 'prenotazione confermata senza approvazione';
  exception when insufficient_privilege then null; end;
end $$;
-- campagne con budget: niente attivazione senza approvazione
insert into public.campaigns (id, title, platform, objective, budget_total) values ('93000000-0000-0000-0000-000000000001', 'Prova', 'Google Ads', 'lead', 500);
do $$ begin
  begin
    update public.campaigns set status = 'active' where id = '93000000-0000-0000-0000-000000000001';
    raise exception 'campagna attivata senza approvazione';
  exception when insufficient_privilege then null; end;
end $$;
-- offerte: niente accettazione senza approvazione
insert into public.supplier_offers (id, partner_id, subject, source, unit_cost) values ('94000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Visita guidata', 'email', 200);
do $$ begin
  begin
    update public.supplier_offers set status = 'accepted' where id = '94000000-0000-0000-0000-000000000001';
    raise exception 'condizioni accettate senza approvazione';
  exception when insufficient_privilege then null; end;
end $$;
-- catalogo: margine nei limiti attivabile in autonomia, fuori limiti no
insert into public.service_catalog (id, kind, title, cost, price, status) values ('95000000-0000-0000-0000-000000000001', 'tour', 'Cave in 4x4', 100, 150, 'active');
do $$ begin
  begin
    insert into public.service_catalog (kind, title, cost, price, status) values ('tour', 'Sottocosto', 100, 105, 'active');
    raise exception 'servizio con margine troppo basso attivato';
  exception when insufficient_privilege then null; end;
  begin
    update public.service_catalog set price = 200 where id = '95000000-0000-0000-0000-000000000001';
    raise exception 'prezzo cambiato oltre la soglia senza approvazione';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- con l'approvazione del proprietario la conferma passa
insert into public.approvals (kind, title, summary, status, payload) values
  ('booking_commitment', 'Conferma', 'x', 'approved', '{"booking_id": "92000000-0000-0000-0000-000000000001"}'),
  ('campaign_activation', 'Campagna', 'x', 'approved', '{"campaign_id": "93000000-0000-0000-0000-000000000001"}');
set local role wc_agents_ops_login;
update public.bookings set status = 'confirmed' where id = '92000000-0000-0000-0000-000000000001';
update public.campaigns set status = 'approved' where id = '93000000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  assert (select status from public.bookings where id = '92000000-0000-0000-0000-000000000001') = 'confirmed', 'conferma non registrata';
  assert (select margin_rate from public.service_catalog where id = '95000000-0000-0000-0000-000000000001') = 33.33, 'margine calcolato male';
  assert (select ok from public.audit_verify()), 'catena del registro non valida';
end $$;

rollback;
\echo 'Operatività: tutti i controlli superati'
