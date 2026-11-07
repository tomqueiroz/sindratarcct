-- Additive migration for the new account-free service. Apply AFTER 202611070001_cct.sql.
-- SOURCE ONLY; run and test on a reviewed staging project before production.
begin;
alter table public.cct_orders alter column user_id drop not null;
alter table public.cct_orders alter column company_id drop not null;
alter table public.cct_orders add constraint cct_order_identity_pair
  check ((user_id is null and company_id is null) or (user_id is not null and company_id is not null));
create unique index cct_guest_idempotency on public.cct_orders(idempotency_key) where user_id is null;
create table public.cct_guest_contacts (
  order_id uuid primary key references public.cct_orders(id),
  full_name text not null,
  job_title text not null,
  cpf text not null check(cpf ~ '^[0-9]{11}$'),
  cnpj text not null check(cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
  legal_name text not null,
  email text not null,
  phone text not null,
  created_at timestamptz not null default now()
);
create table public.cct_guest_access (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  order_id uuid not null references public.cct_orders(id),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create table public.cct_guest_rate (
  bucket text primary key,
  hits integer not null,
  expires_at timestamptz not null
);
do $$ declare t text; begin
  foreach t in array array['cct_guest_contacts','cct_guest_access','cct_guest_rate'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
-- Existing own-account policies intentionally give no access to NULL-user orders.
alter table public.cct_outbox drop constraint cct_outbox_kind_check;
alter table public.cct_outbox add constraint cct_outbox_kind_check
  check(kind in ('payment_instructions','payment_recognized','documents_ready','member_approved','finance_ready'));

create function public.cct_create_guest_order(p_key text,p_hash text,p_codes text[],p_municipality text,
  p_document uuid,p_contact jsonb) returns public.cct_orders
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public.cct_orders; v_elig jsonb; v_doc public.cct_documents;
  v_bucket text; v_hour text:=to_char(now() at time zone 'UTC','YYYYMMDDHH'); v_hits integer; v_limit integer;
begin
  if p_key !~ '^[a-f0-9-]{36}$' or p_hash !~ '^[a-f0-9]{64}$'
    or p_contact->>'cpf' !~ '^[0-9]{11}$' or p_contact->>'cnpj' !~ '^[A-Z0-9]{12}[0-9]{2}$'
    or length(p_contact->>'email') not between 5 and 254
  then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('guest:'||p_key,0));
  select * into v_order from public.cct_orders where user_id is null and idempotency_key=p_key;
  if found then
    if v_order.request_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_order;
  end if;
  delete from public.cct_guest_rate where expires_at<now();
  foreach v_bucket in array array['global:'||v_hour,'email:'||md5(p_contact->>'email')||':'||v_hour] loop
    v_limit:=case when v_bucket like 'global:%' then 500 else 5 end;
    insert into public.cct_guest_rate(bucket,hits,expires_at) values(v_bucket,1,now()+interval '2 hours')
    on conflict(bucket) do update set hits=cct_guest_rate.hits+1 where cct_guest_rate.hits<v_limit
    returning hits into v_hits;
    if not found then raise exception 'RATE_LIMITED'; end if;
  end loop;
  perform 1 from public.cct_documents where id=p_document for share;
  v_elig:=public.cct_eligibility(p_codes,p_municipality);
  -- Ambiguous matches go to staff, never to an automatic charge.
  if jsonb_array_length(v_elig->'documents')<>1 or (v_elig->'documents'->0->>'id')::uuid<>p_document
  then raise exception 'INELIGIBLE_DOCUMENT'; end if;
  select * into v_doc from public.cct_documents where id=p_document;
  if not found or v_doc.nonmember_price_cents<=0 then raise exception 'INVALID_PRICE'; end if;
  insert into public.cct_orders(user_id,company_id,catalog_id,idempotency_key,request_hash,total_cents,
    document_snapshot,eligibility_snapshot,approved_member_benefit)
  values(null,null,v_doc.catalog_id,p_key,p_hash,v_doc.nonmember_price_cents,
    jsonb_build_array(jsonb_build_object('id',v_doc.id,'title',v_doc.title,'version',v_doc.version,
      'storagePath',v_doc.storage_path,'sha256',v_doc.sha256,'priceCents',v_doc.nonmember_price_cents,'accessDays',v_doc.access_days)),
    jsonb_build_object('codes',p_codes,'municipality',p_municipality),false) returning * into v_order;
  insert into public.cct_guest_contacts(order_id,full_name,job_title,cpf,cnpj,legal_name,email,phone)
    values(v_order.id,p_contact->>'name',p_contact->>'position',p_contact->>'cpf',p_contact->>'cnpj',
      p_contact->>'companyName',p_contact->>'email',p_contact->>'phone');
  insert into public.cct_audit_log(order_id,event_code,actor_reference) values(v_order.id,'GUEST_ORDER_CREATED','guest-edge');
  return v_order;
end $$;
create function public.cct_guest_charge_outbox() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if new.provider_charge_id is not null and exists(select 1 from public.cct_guest_contacts where order_id=new.order_id) then
    insert into public.cct_outbox(order_id,kind,dedup_key)
      values(new.order_id,'payment_instructions','instructions:'||new.order_id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger cct_guest_charge_notification after update on public.cct_charge_requests
for each row execute function public.cct_guest_charge_outbox();
create function public.cct_guest_finance_outbox() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if new.status='ready' and old.status<>'ready' and exists(select 1 from public.cct_guest_contacts where order_id=new.id) then
    insert into public.cct_outbox(order_id,kind,dedup_key)
      values(new.id,'finance_ready','finance-ready:'||new.id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger cct_guest_finance_notification after update on public.cct_orders
for each row execute function public.cct_guest_finance_outbox();
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'cct_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
