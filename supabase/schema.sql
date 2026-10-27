-- RADAR ASTE ITALIA — account e abbonamenti (Supabase, PostgreSQL). MODALITÀ TEST.
-- -------------------------------------------------------------------------------------------------------------------
-- Da eseguire nell'editor SQL del progetto Supabase (SQL Editor → New query → Run). È idempotente: si può rieseguire
-- senza perdere dati (create ... if not exists, create or replace, drop policy/trigger if exists).
--
-- Tabelle
--   profili        una riga per utente (email), creata da sola alla registrazione
--   abbonamenti    piano e stato dell'abbonamento Stripe; la scrivono SOLO le funzioni del sito (service role)
--                  dopo i webhook di Stripe: il browser la può soltanto leggere, e solo per la propria riga
--   dati_utente    dati del sito sincronizzati tra i dispositivi (aste seguite, note, preferenze...): ognuno legge
--                  e scrive solo i propri
--   eventi_stripe  eventi dei webhook già elaborati (per non elaborarli due volte): solo service role
--
-- Sicurezza: Row Level Security attiva su tutte le tabelle. La service role delle funzioni (functions/, servizi/)
-- scavalca la RLS e non va MAI usata nel browser; il browser usa la chiave anonima e il token dell'utente.
-- Alla cancellazione di un utente da auth.users le sue righe spariscono con lui (on delete cascade).
--
-- Dopo lo schema, nel pannello di Supabase (Authentication):
--   URL Configuration  Site URL = indirizzo del sito (lo stesso di SITO_URL su Cloudflare); in Redirect URLs
--                      l'indirizzo della pagina di accesso con i parametri, per esempio https://<sito>/accedi.html**
--                      (email di conferma, link di accesso e Google tornano lì con ?dopo=<pagina>)
--   Providers          Email con "Confirm email" attivo; Google solo se serve (ID e segreto client di Google Cloud)
--   Email Templates    testi delle email in italiano
-- Nel sito vanno solo l'indirizzo del progetto e la chiave anonima (config/abbonamenti.js), MAI la service role.

-- ---------- tabelle -------------------------------------------------------------------------------------------------

create table if not exists public.profili (
  id     uuid primary key references auth.users (id) on delete cascade,
  email  text,
  creato timestamptz not null default now()
);
comment on table public.profili is 'Profilo di ogni utente del sito (una riga per account), creato alla registrazione.';
comment on column public.profili.email is 'Email dell''account, tenuta allineata a auth.users.';

create table if not exists public.abbonamenti (
  utente              uuid primary key references auth.users (id) on delete cascade,
  stripe_customer     text,
  stripe_subscription text,
  piano               text not null default 'gratis' check (piano in ('gratis', 'base', 'pro')),
  periodo             text check (periodo is null or periodo in ('mensile', 'annuale')),
  stato               text,
  fine_prova          timestamptz,
  fine_periodo        timestamptz,
  cancella_alla_fine  boolean not null default false,
  aggiornato          timestamptz not null default now()
);
comment on table public.abbonamenti is 'Abbonamento di ogni utente. Scritta solo dalle funzioni del sito (service role) dopo i webhook di Stripe; il browser legge solo la propria riga.';
comment on column public.abbonamenti.stato is 'Stato Stripe dell''abbonamento: active, trialing, past_due, canceled, incomplete, incomplete_expired, unpaid, paused (null = mai abbonato).';
comment on column public.abbonamenti.cancella_alla_fine is 'Disdetta programmata: l''abbonamento resta attivo fino a fine_periodo.';

create table if not exists public.dati_utente (
  utente     uuid primary key references auth.users (id) on delete cascade,
  dati       jsonb not null default '{}'::jsonb,
  aggiornato timestamptz not null default now(),
  -- tetto alle dimensioni (circa 2 MB): bastano migliaia di aste seguite con le note
  constraint dati_utente_dimensione check (octet_length(dati::text) <= 2000000)
);
comment on table public.dati_utente is 'Dati del sito sincronizzati tra i dispositivi: { versione, aggiornato, chiavi: { "radaraste.v1.seguite": { valore, aggiornato, orari, rimosse }, ... } }.';

create table if not exists public.eventi_stripe (
  id       text primary key,
  tipo     text,
  ricevuto timestamptz not null default now()
);
comment on table public.eventi_stripe is 'Eventi dei webhook di Stripe già elaborati (idempotenza). Solo service role. Le righe più vecchie di qualche mese si possono cancellare.';

-- ---------- indici --------------------------------------------------------------------------------------------------

-- i webhook cercano l'utente per abbonamento o per cliente Stripe
create index if not exists abbonamenti_stripe_subscription_idx on public.abbonamenti (stripe_subscription) where stripe_subscription is not null;
create index if not exists abbonamenti_stripe_customer_idx on public.abbonamenti (stripe_customer) where stripe_customer is not null;
-- pulizia degli eventi vecchi
create index if not exists eventi_stripe_ricevuto_idx on public.eventi_stripe (ricevuto);

-- ---------- registrazione: profilo e piano Gratis --------------------------------------------------------------------

-- security definer: gira con i permessi del proprietario dello schema (il nuovo utente non può scrivere da sé);
-- search_path vuoto e nomi completi, come raccomanda Supabase
create or replace function public.radaraste_nuovo_utente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profili (id, email) values (new.id, new.email)
    on conflict (id) do update set email = excluded.email;
  insert into public.abbonamenti (utente, piano) values (new.id, 'gratis')
    on conflict (utente) do nothing;
  return new;
end;
$$;
comment on function public.radaraste_nuovo_utente() is 'Alla registrazione crea il profilo e la riga dell''abbonamento con il piano Gratis.';

drop trigger if exists radaraste_nuovo_utente on auth.users;
create trigger radaraste_nuovo_utente
  after insert on auth.users
  for each row execute function public.radaraste_nuovo_utente();

-- email cambiata dall'utente: si aggiorna anche il profilo
create or replace function public.radaraste_email_aggiornata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profili set email = new.email where id = new.id;
  return new;
end;
$$;
comment on function public.radaraste_email_aggiornata() is 'Tiene l''email del profilo allineata a quella dell''account.';

drop trigger if exists radaraste_email_aggiornata on auth.users;
create trigger radaraste_email_aggiornata
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.radaraste_email_aggiornata();

-- dati_utente: l'ora dell'ultimo salvataggio la decide il database, non il browser
create or replace function public.radaraste_dati_aggiornati()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.aggiornato := now();
  return new;
end;
$$;

drop trigger if exists radaraste_dati_aggiornati on public.dati_utente;
create trigger radaraste_dati_aggiornati
  before insert or update on public.dati_utente
  for each row execute function public.radaraste_dati_aggiornati();

-- le funzioni dei trigger non servono a nessuno fuori dai trigger: niente permesso di eseguirle (Supabase lo concede
-- di serie a anon e authenticated). PostgreSQL non lo controlla quando scatta il trigger, quindi i trigger funzionano.
revoke execute on function public.radaraste_nuovo_utente() from public, anon, authenticated;
revoke execute on function public.radaraste_email_aggiornata() from public, anon, authenticated;
revoke execute on function public.radaraste_dati_aggiornati() from public, anon, authenticated;

-- utenti registrati prima di questo schema: profilo e piano Gratis anche per loro
insert into public.profili (id, email) select id, email from auth.users on conflict (id) do nothing;
insert into public.abbonamenti (utente, piano) select id, 'gratis' from auth.users on conflict (utente) do nothing;

-- ---------- Row Level Security --------------------------------------------------------------------------------------

alter table public.profili enable row level security;
alter table public.abbonamenti enable row level security;
alter table public.dati_utente enable row level security;
alter table public.eventi_stripe enable row level security;

-- permessi di base (oltre alla RLS): chi non ha fatto l'accesso non tocca nulla, l'abbonamento si legge soltanto,
-- gli eventi di Stripe non si vedono dal browser
revoke all on table public.profili from public, anon, authenticated;
revoke all on table public.abbonamenti from public, anon, authenticated;
revoke all on table public.dati_utente from public, anon, authenticated;
revoke all on table public.eventi_stripe from public, anon, authenticated;
grant select on table public.profili to authenticated;
grant select on table public.abbonamenti to authenticated;
grant select, insert, update on table public.dati_utente to authenticated;

-- profili: ognuno legge solo il proprio (lo scrivono il trigger e la service role)
drop policy if exists "profili: lettura del proprio" on public.profili;
create policy "profili: lettura del proprio" on public.profili
  for select to authenticated
  using ((select auth.uid()) = id);

-- abbonamenti: ognuno legge solo il proprio. NESSUNA policy di scrittura: inserimenti e modifiche arrivano solo
-- dalle funzioni del sito con la service role, dopo i webhook firmati di Stripe
drop policy if exists "abbonamenti: lettura del proprio" on public.abbonamenti;
create policy "abbonamenti: lettura del proprio" on public.abbonamenti
  for select to authenticated
  using ((select auth.uid()) = utente);

-- dati_utente: ognuno legge, crea e aggiorna solo i propri (la cancellazione passa dalla funzione del sito)
drop policy if exists "dati_utente: lettura dei propri" on public.dati_utente;
create policy "dati_utente: lettura dei propri" on public.dati_utente
  for select to authenticated
  using ((select auth.uid()) = utente);

drop policy if exists "dati_utente: inserimento dei propri" on public.dati_utente;
create policy "dati_utente: inserimento dei propri" on public.dati_utente
  for insert to authenticated
  with check ((select auth.uid()) = utente);

drop policy if exists "dati_utente: modifica dei propri" on public.dati_utente;
create policy "dati_utente: modifica dei propri" on public.dati_utente
  for update to authenticated
  using ((select auth.uid()) = utente)
  with check ((select auth.uid()) = utente);

-- eventi_stripe: RLS attiva e nessuna policy = nessun accesso dal browser (solo service role)
