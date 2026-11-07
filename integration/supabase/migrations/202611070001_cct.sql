-- SOURCE PACKAGE ONLY. Not applied to lbrtshklxkhvlewwdpfb.
-- Run in a reviewed, backed-up Supabase staging project first.
begin;
create extension if not exists pgcrypto;

create table public.cct_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.cct_companies (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique check (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
  legal_name text not null check (length(legal_name) between 2 and 160),
  created_at timestamptz not null default now()
);
create table public.cct_company_users (
  company_id uuid references public.cct_companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  membership_approved boolean not null default false,
  benefit_valid_until timestamptz,
  approved_by text,
  primary key(company_id,user_id),
  check (not membership_approved or (approved_by is not null and benefit_valid_until is not null))
);
create table public.cct_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  published boolean not null default false,
  reviewed_at timestamptz,
  is_demo boolean not null default true,
  valid_from date not null,
  valid_until date not null check(valid_until >= valid_from),
  check(not published or (reviewed_at is not null and not is_demo))
);
create table public.cct_cnae_rules (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.cct_catalog_versions(id),
  code text not null check(code ~ '^[0-9]{7}$'),
  description text not null,
  unique(catalog_id,code),
  unique(id,catalog_id)
);
create table public.cct_bases (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.cct_catalog_versions(id),
  municipality_ibge text not null check(municipality_ibge ~ '^[0-9]{7}$'),
  municipality_name text not null,
  state text not null check(state = 'SP'),
  unique(catalog_id,municipality_ibge),
  unique(id,catalog_id)
);
create table public.cct_documents (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.cct_catalog_versions(id),
  title text not null,
  version text not null,
  storage_path text not null unique check(storage_path ~ '^cct/[a-zA-Z0-9/_-]+[.]pdf$'),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  nonmember_price_cents integer not null default 6911 check(nonmember_price_cents >= 0),
  access_days integer not null default 365 check(access_days between 1 and 3650),
  pdf_verified_at timestamptz,
  unique(id,catalog_id)
);
-- A document may cover multiple CNAEs and municipalities; both must match.
create table public.cct_document_cnaes (
  document_id uuid not null,
  rule_id uuid not null,
  catalog_id uuid not null,
  primary key(document_id,rule_id),
  foreign key(document_id,catalog_id) references public.cct_documents(id,catalog_id),
  foreign key(rule_id,catalog_id) references public.cct_cnae_rules(id,catalog_id)
);
create table public.cct_document_bases (
  document_id uuid not null,
  base_id uuid not null,
  catalog_id uuid not null,
  primary key(document_id,base_id),
  foreign key(document_id,catalog_id) references public.cct_documents(id,catalog_id),
  foreign key(base_id,catalog_id) references public.cct_bases(id,catalog_id)
);
create table public.cct_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  company_id uuid not null references public.cct_companies(id),
  catalog_id uuid not null references public.cct_catalog_versions(id),
  idempotency_key text not null check(length(idempotency_key) between 16 and 100),
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  total_cents integer not null check(total_cents >= 0),
  currency text not null default 'BRL' check(currency = 'BRL'),
  document_snapshot jsonb not null check(jsonb_typeof(document_snapshot) = 'array'),
  eligibility_snapshot jsonb not null,
  approved_member_benefit boolean not null,
  status text not null default 'pending_payment'
    check(status in ('pending_payment','awaiting_release','ready','expired','canceled','refunded')),
  payment_expires_at timestamptz not null default now()+interval '3 days',
  recognized_at timestamptz,
  released_at timestamptz,
  download_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id,idempotency_key)
);
create table public.cct_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.cct_orders(id),
  provider text not null,
  provider_transaction_id text not null,
  reference text not null,
  amount_cents integer not null check(amount_cents >= 0),
  currency text not null check(currency='BRL'),
  recognized_at timestamptz not null,
  unique(provider,provider_transaction_id),
  unique(order_id)
);
create table public.cct_provider_events (
  provider text not null,
  event_id text not null,
  payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
  order_id uuid,
  outcome text not null check(outcome in ('received','accepted','rejected','duplicate')),
  created_at timestamptz not null default now(),
  primary key(provider,event_id)
);
create table public.cct_charge_requests (
  order_id uuid primary key references public.cct_orders(id),
  idempotency_key text not null unique,
  provider_charge_id text unique,
  public_instructions jsonb,
  created_at timestamptz not null default now()
);
create table public.cct_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.cct_orders(id),
  kind text not null check(kind in ('payment_recognized','documents_ready','member_approved')),
  dedup_key text not null unique,
  status text not null default 'pending' check(status in ('pending','leased','sent','dead')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  first_attempt_at timestamptz,
  provider_message_id text,
  last_error_code text,
  created_at timestamptz not null default now()
);
create index cct_outbox_due on public.cct_outbox(status,available_at);
create table public.cct_audit_log (
  id bigint generated always as identity primary key,
  order_id uuid references public.cct_orders(id),
  event_code text not null check(event_code ~ '^[A-Z_]{3,60}$'),
  actor_reference text not null, -- service identity or irreversible user reference, no PII
  created_at timestamptz not null default now()
);

-- All exposed tables have RLS. Browser gets only narrow read grants.
do $$ declare t text; begin
  foreach t in array array['cct_profiles','cct_companies','cct_company_users',
    'cct_catalog_versions','cct_cnae_rules','cct_bases','cct_documents',
    'cct_document_cnaes','cct_document_bases','cct_orders','cct_payments',
    'cct_provider_events','cct_charge_requests','cct_outbox','cct_audit_log'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
  end loop;
end $$;
grant usage,select on sequence public.cct_audit_log_id_seq to service_role;
grant select on public.cct_profiles,public.cct_companies,public.cct_company_users,
  public.cct_orders,public.cct_payments to authenticated;
create policy profiles_own on public.cct_profiles for select to authenticated using(user_id=auth.uid());
create policy memberships_own on public.cct_company_users for select to authenticated using(user_id=auth.uid());
create policy companies_own on public.cct_companies for select to authenticated
  using(exists(select 1 from public.cct_company_users u where u.company_id=id and u.user_id=auth.uid()));
create policy orders_own on public.cct_orders for select to authenticated using(user_id=auth.uid());
create policy payments_own on public.cct_payments for select to authenticated
  using(exists(select 1 from public.cct_orders o where o.id=order_id and o.user_id=auth.uid()));
-- Catalog has no direct browser grants; eligibility API returns no storage paths.
-- No insert/update/delete browser policies: status, benefits, admin and pricing are server-only.

create function public.cct_guard_order_snapshot() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if row(new.user_id,new.company_id,new.catalog_id,new.idempotency_key,new.request_hash,
    new.total_cents,new.currency,new.document_snapshot,new.eligibility_snapshot,new.approved_member_benefit)
    is distinct from row(old.user_id,old.company_id,old.catalog_id,old.idempotency_key,old.request_hash,
    old.total_cents,old.currency,old.document_snapshot,old.eligibility_snapshot,old.approved_member_benefit)
  then raise exception 'IMMUTABLE_ORDER'; end if;
  if old.status in ('refunded','canceled','expired') and new.status<>old.status
  then raise exception 'TERMINAL_ORDER'; end if;
  return new;
end $$;
create trigger cct_order_immutable before update on public.cct_orders
for each row execute function public.cct_guard_order_snapshot();

-- Published catalog rows are append-only. Corrections require a new version.
create function public.cct_guard_catalog() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare v_catalog uuid; v_published boolean;
begin
  if tg_table_name='cct_catalog_versions' then
    if old.published then raise exception 'PUBLISHED_CATALOG_IMMUTABLE'; end if;
  else
    v_catalog:=case when tg_op='DELETE' then old.catalog_id else new.catalog_id end;
    select published into v_published from public.cct_catalog_versions where id=v_catalog for share;
    if v_published then raise exception 'PUBLISHED_CATALOG_IMMUTABLE'; end if;
    if tg_op='UPDATE' and old.catalog_id<>new.catalog_id then raise exception 'CATALOG_REPARENT_FORBIDDEN'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger cct_version_freeze before update or delete on public.cct_catalog_versions
for each row execute function public.cct_guard_catalog();
do $$ declare t text; begin
  foreach t in array array['cct_cnae_rules','cct_bases','cct_documents','cct_document_cnaes','cct_document_bases'] loop
    execute format('create trigger cct_catalog_freeze before insert or update or delete on public.%I for each row execute function public.cct_guard_catalog()',t);
  end loop;
end $$;

create function public.cct_municipalities() returns jsonb
language sql security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('municipalities',coalesce(jsonb_agg(jsonb_build_object('name',m.municipality_name,'ibge',m.municipality_ibge) order by m.municipality_name),'[]'::jsonb))
  from (
    select distinct b.municipality_name,b.municipality_ibge from public.cct_bases b
    join public.cct_catalog_versions c on c.id=b.catalog_id
    where c.published and not c.is_demo and c.reviewed_at is not null
      and current_date between c.valid_from and c.valid_until
  ) m;
$$;

create function public.cct_eligibility(p_codes text[],p_municipality text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_result jsonb;
begin
  if cardinality(p_codes) not between 1 and 20 or p_municipality !~ '^[0-9]{7}$'
    or exists(select 1 from unnest(p_codes) x where x !~ '^[0-9]{7}$')
  then raise exception 'INVALID_INPUT'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'version',d.version,
    'catalogId',d.catalog_id,'priceCents',d.nonmember_price_cents)), '[]'::jsonb)
  into v_result from public.cct_documents d
  join public.cct_catalog_versions c on c.id=d.catalog_id
  where c.published and not c.is_demo and c.reviewed_at is not null
    and current_date between c.valid_from and c.valid_until and d.pdf_verified_at is not null
    and exists(select 1 from public.cct_document_cnaes dc join public.cct_cnae_rules r on r.id=dc.rule_id
      where dc.document_id=d.id and r.code=any(p_codes))
    and exists(select 1 from public.cct_document_bases db join public.cct_bases b on b.id=db.base_id
      where db.document_id=d.id and b.municipality_ibge=p_municipality);
  return jsonb_build_object('documents',v_result,'eligible',jsonb_array_length(v_result)>0);
end $$;

create function public.cct_register_company(p_user uuid,p_cnpj text,p_name text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
  if p_cnpj !~ '^[A-Z0-9]{12}[0-9]{2}$' or length(p_name) not between 2 and 160
  then raise exception 'INVALID_INPUT'; end if;
  -- Existing CNPJ must never be claimed simply by knowing its number.
  select c.id into v_id from public.cct_companies c join public.cct_company_users u on u.company_id=c.id
  where c.cnpj=p_cnpj and u.user_id=p_user;
  if v_id is not null then return v_id; end if;
  if exists(select 1 from public.cct_companies where cnpj=p_cnpj)
  then raise exception 'COMPANY_CLAIM_REQUIRES_STAFF'; end if;
  insert into public.cct_profiles(user_id) values(p_user) on conflict do nothing;
  insert into public.cct_companies(cnpj,legal_name) values(p_cnpj,p_name) returning id into v_id;
  insert into public.cct_company_users(company_id,user_id) values(v_id,p_user);
  return v_id;
end $$;

create function public.cct_create_order(p_user uuid,p_company uuid,p_key text,p_hash text,
  p_codes text[],p_municipality text,p_documents uuid[]) returns public.cct_orders
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public.cct_orders; v_eligible jsonb; v_snapshot jsonb;
  v_total integer; v_catalog uuid; v_member boolean; v_count integer;
begin
  if p_key is null or length(p_key) not between 16 and 100 or p_hash !~ '^[a-f0-9]{64}$'
    or cardinality(p_documents) not between 1 and 20
    or cardinality(p_documents) <> (select count(distinct x) from unnest(p_documents) x)
  then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_key,0));
  select * into v_order from public.cct_orders where user_id=p_user and idempotency_key=p_key;
  if found then
    if v_order.request_hash <> p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_order;
  end if;
  select membership_approved and benefit_valid_until>now() into v_member
    from public.cct_company_users where user_id=p_user and company_id=p_company for share;
  if not found then raise exception 'FORBIDDEN_COMPANY'; end if;
  v_member:=coalesce(v_member,false);
  -- Lock catalog/document records against administrative concurrent modifications.
  perform 1 from public.cct_documents where id=any(p_documents) for share;
  perform 1 from public.cct_catalog_versions where id in
    (select catalog_id from public.cct_documents where id=any(p_documents)) for share;
  v_eligible:=public.cct_eligibility(p_codes,p_municipality);
  if exists(select 1 from unnest(p_documents) x where not exists
    (select 1 from jsonb_array_elements(v_eligible->'documents') e where (e->>'id')::uuid=x))
  then raise exception 'INELIGIBLE_DOCUMENT'; end if;
  select count(distinct catalog_id),min(catalog_id::text)::uuid into v_count,v_catalog
    from public.cct_documents where id=any(p_documents);
  if v_count<>1 then raise exception 'MIXED_CATALOG'; end if;
  select jsonb_agg(jsonb_build_object('id',id,'title',title,'version',version,'storagePath',storage_path,
    'sha256',sha256,'priceCents',case when v_member then 0 else nonmember_price_cents end,
    'accessDays',access_days) order by id),
    sum(case when v_member then 0 else nonmember_price_cents end)::integer
    into v_snapshot,v_total from public.cct_documents where id=any(p_documents);
  insert into public.cct_orders(user_id,company_id,catalog_id,idempotency_key,request_hash,total_cents,
    document_snapshot,eligibility_snapshot,approved_member_benefit,status,recognized_at)
    values(p_user,p_company,v_catalog,p_key,p_hash,v_total,v_snapshot,
      jsonb_build_object('codes',p_codes,'municipality',p_municipality),v_member,
      case when v_member then 'awaiting_release' else 'pending_payment' end,
      case when v_member then now() else null end) returning * into v_order;
  if v_member then
    insert into public.cct_outbox(order_id,kind,dedup_key)
      values(v_order.id,'member_approved','member:'||v_order.id);
    perform public.cct_try_auto_release(v_order.id);
    select * into v_order from public.cct_orders where id=v_order.id;
  end if;
  insert into public.cct_audit_log(order_id,event_code,actor_reference)
    values(v_order.id,'ORDER_CREATED','edge');
  return v_order;
end $$;

-- Called ONLY with an event that the contracted adapter cryptographically verified
-- or independently retrieved via bank reconciliation, never with browser input.
create function public.cct_reconcile_payment(p_provider text,p_event text,p_payload_hash text,
  p_order uuid,p_transaction text,p_reference text,p_amount integer,p_currency text,p_paid_at timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public.cct_orders; v_existing public.cct_provider_events;
begin
  insert into public.cct_provider_events(provider,event_id,payload_sha256,order_id,outcome)
    values(p_provider,p_event,p_payload_hash,p_order,'received') on conflict do nothing;
  if not found then
    select * into v_existing from public.cct_provider_events where provider=p_provider and event_id=p_event;
    if v_existing.payload_sha256<>p_payload_hash then
      return jsonb_build_object('accepted',false,'code','EVENT_ID_COLLISION');
    end if;
    return jsonb_build_object('accepted',v_existing.outcome='accepted','duplicate',true);
  end if;
  select * into v_order from public.cct_orders where id=p_order for update;
  if not found or v_order.status<>'pending_payment' or v_order.payment_expires_at<=now()
    or p_reference<>p_order::text or p_amount<>v_order.total_cents or p_currency<>'BRL'
    or p_paid_at is null or p_paid_at>now()+interval '5 minutes'
    or p_paid_at<v_order.created_at or p_transaction is null or length(p_transaction)=0
    or exists(select 1 from public.cct_payments where provider=p_provider and provider_transaction_id=p_transaction)
  then
    update public.cct_provider_events set outcome='rejected' where provider=p_provider and event_id=p_event;
    insert into public.cct_audit_log(event_code,actor_reference) values('PAYMENT_REJECTED','bank-adapter');
    return jsonb_build_object('accepted',false,'code','RECONCILIATION_MISMATCH');
  end if;
  insert into public.cct_payments(order_id,provider,provider_transaction_id,reference,amount_cents,currency,recognized_at)
    values(p_order,p_provider,p_transaction,p_reference,p_amount,p_currency,p_paid_at);
  update public.cct_orders set status='awaiting_release',recognized_at=p_paid_at where id=p_order;
  update public.cct_provider_events set outcome='accepted' where provider=p_provider and event_id=p_event;
  insert into public.cct_outbox(order_id,kind,dedup_key)
    values(p_order,'payment_recognized','paid:'||p_order) on conflict do nothing;
  perform public.cct_try_auto_release(p_order);
  insert into public.cct_audit_log(order_id,event_code,actor_reference)
    values(p_order,'PAYMENT_RECOGNIZED','bank-adapter');
  return jsonb_build_object('accepted',true);
end $$;

create function public.cct_reserve_charge(p_order uuid) returns public.cct_charge_requests
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_result public.cct_charge_requests;
begin
  if not exists(select 1 from public.cct_orders where id=p_order and status='pending_payment' and payment_expires_at>now())
  then raise exception 'ORDER_NOT_PAYABLE'; end if;
  insert into public.cct_charge_requests(order_id,idempotency_key)
    values(p_order,'charge-'||p_order) on conflict do nothing;
  select * into v_result from public.cct_charge_requests where order_id=p_order;
  return v_result;
end $$;
create function public.cct_record_charge(p_order uuid,p_provider_id text,p_instructions jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_charge public.cct_charge_requests;
begin
  select * into v_charge from public.cct_charge_requests where order_id=p_order for update;
  if not found or p_provider_id is null or length(p_provider_id) not between 1 and 160
  then raise exception 'INVALID_CHARGE'; end if;
  if v_charge.provider_charge_id is not null and v_charge.provider_charge_id<>p_provider_id
  then raise exception 'CHARGE_IDEMPOTENCY_CONFLICT'; end if;
  update public.cct_charge_requests set provider_charge_id=p_provider_id,public_instructions=p_instructions
    where order_id=p_order;
end $$;

-- Happy path: verified payment or server-approved membership automatically releases
-- the already-reviewed snapshot, atomically with event/payment/outbox transaction.
create function public.cct_try_auto_release(p_order uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public.cct_orders; v_days integer;
begin
  select * into v_order from public.cct_orders where id=p_order for update;
  if not found then return false; end if;
  if v_order.status='ready' then return true; end if;
  if v_order.status<>'awaiting_release' or v_order.recognized_at is null
    or jsonb_array_length(v_order.document_snapshot)=0 then return false; end if;
  if exists(select 1 from jsonb_array_elements(v_order.document_snapshot) e
    where not exists(select 1 from storage.objects o
      where o.bucket_id='cct-private' and o.name=e->>'storagePath'))
  then
    insert into public.cct_audit_log(order_id,event_code,actor_reference)
      values(p_order,'AUTO_RELEASE_BLOCKED_PDF','delivery-service');
    return false;
  end if;
  select min((e->>'accessDays')::integer) into v_days from jsonb_array_elements(v_order.document_snapshot) e;
  update public.cct_orders set status='ready',released_at=now(),
    download_expires_at=now()+make_interval(days=>v_days) where id=p_order;
  insert into public.cct_outbox(order_id,kind,dedup_key)
    values(p_order,'documents_ready','ready:'||p_order) on conflict do nothing;
  insert into public.cct_audit_log(order_id,event_code,actor_reference)
    values(p_order,'DOCUMENTS_AUTO_RELEASED','delivery-service');
  return true;
end $$;

-- Manual operation is only an exception-recovery path after missing PDF repair.
create function public.cct_release_order(p_order uuid,p_staff_reference text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public.cct_orders; v_days integer;
begin
  select * into v_order from public.cct_orders where id=p_order for update;
  if not found or v_order.status<>'awaiting_release' or v_order.recognized_at is null
    or length(p_staff_reference)<3 then raise exception 'NOT_RELEASABLE'; end if;
  if exists(select 1 from jsonb_array_elements(v_order.document_snapshot) e
    where not exists(select 1 from storage.objects o
      where o.bucket_id='cct-private' and o.name=e->>'storagePath'))
  then raise exception 'PDF_MISSING'; end if;
  select min((e->>'accessDays')::integer) into v_days from jsonb_array_elements(v_order.document_snapshot) e;
  update public.cct_orders set status='ready',released_at=now(),download_expires_at=now()+make_interval(days=>v_days)
    where id=p_order;
  insert into public.cct_outbox(order_id,kind,dedup_key)
    values(p_order,'documents_ready','ready:'||p_order) on conflict do nothing;
  insert into public.cct_audit_log(order_id,event_code,actor_reference)
    values(p_order,'DOCUMENTS_RELEASED',p_staff_reference);
end $$;

create function public.cct_lease_outbox(p_limit integer default 10) returns setof public.cct_outbox
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  -- Resend idempotency window: do not retry automatically beyond 23h.
  update public.cct_outbox set status='dead',last_error_code='IDEMPOTENCY_WINDOW_CLOSED'
    where status in ('pending','leased') and first_attempt_at<now()-interval '23 hours';
  update public.cct_outbox set status='dead',last_error_code='MAX_ATTEMPTS'
    where status='leased' and lease_until<=now() and attempts>=8;
  return query with due as (
    select id from public.cct_outbox
    where ((status='pending' and available_at<=now()) or (status='leased' and lease_until<=now()))
      and attempts<8
    order by available_at for update skip locked limit least(greatest(p_limit,1),50)
  ) update public.cct_outbox o set status='leased',lease_token=gen_random_uuid(),
      lease_until=now()+interval '2 minutes',attempts=o.attempts+1,
      first_attempt_at=coalesce(o.first_attempt_at,now())
    from due where o.id=due.id returning o.*;
end $$;
create function public.cct_ack_outbox(p_id uuid,p_lease uuid,p_message text,p_error text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update public.cct_outbox set
    status=case when p_error is null then 'sent' when attempts>=8 then 'dead' else 'pending' end,
    provider_message_id=case when p_error is null then p_message else null end,
    last_error_code=p_error,
    available_at=now()+make_interval(secs=>least(21600,30*power(2,attempts)::integer)),
    lease_token=null,lease_until=null
  where id=p_id and status='leased' and lease_token=p_lease and lease_until>now();
  return found;
end $$;

-- Private PDF bytes are not in the Website source or public bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cct-private','cct-private',false,52428800,array['application/pdf'])
on conflict(id) do nothing;
-- Fail closed if an existing bucket with this name was public.
do $$ begin
  if exists(select 1 from storage.buckets where id='cct-private' and public)
  then raise exception 'EXISTING_BUCKET_IS_PUBLIC'; end if;
end $$;
-- No storage.objects policy is granted to anon/authenticated for this bucket.
-- Restrictive denial defeats pre-existing broad permissive Storage policies too.
create policy cct_private_no_browser on storage.objects as restrictive for all
to anon,authenticated using(bucket_id<>'cct-private') with check(bucket_id<>'cct-private');

do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cct_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
