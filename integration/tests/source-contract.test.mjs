import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const load = path => readFileSync(new URL(path,import.meta.url),'utf8');
const html=load('../wordpress/pagina-cct-servico.html');
const sql=load('../supabase/migrations/202611070001_cct.sql');
const php=load('../wordpress/sindratar-cct.php');
test('LP JavaScript compiles; native service has three steps, no account and official asset',()=>{
  const match=html.match(/<script id="sindratar-cct-script">([\s\S]*?)<\/script>/);
  assert.ok(match);assert.doesNotThrow(()=>new vm.Script(match[1]));
  for(const step of [0,1,2])assert.ok(html.includes(`data-step="${step}"`));
  assert.ok(!html.includes('data-step="3"'));
  assert.ok(html.includes('src="/assets/slots/brand.header.png"'));
  assert.ok(!/<iframe\b/i.test(html));
  assert.ok(!html.includes('signInWithOtp'));
  assert.ok(html.includes('guest-orders'));
});
test('every exposed SQL table is included in RLS/revoke loop',()=>{
  const tables=[...sql.matchAll(/create table public\.(cct_[a-z_]+)\s*\(/g)].map(m=>m[1]);
  const loop=sql.match(/foreach t in array array\[([\s\S]*?)\] loop\s*execute format\('alter table/);
  assert.ok(loop);
  assert.equal(tables.length,15);
  for(const table of tables)assert.ok(loop[1].includes(`'${table}'`),`${table} lacks RLS`);
  assert.match(sql,/revoke all on table public\.%I from public, anon, authenticated/);
  assert.match(sql,/revoke all on function %s from public,anon,authenticated/);
  assert.match(sql,/cct_private_no_browser on storage\.objects as restrictive/);
});
test('SQL boundaries include snapshots, exact reconciliation, transaction dedup and leases',()=>{
  for(const contract of ['IMMUTABLE_ORDER','PUBLISHED_CATALOG_IMMUTABLE','unique(user_id,idempotency_key)',
    'primary key(provider,event_id)','unique(provider,provider_transaction_id)',
    "p_amount<>v_order.total_cents","p_currency<>'BRL'","p_reference<>p_order::text",
    'for update skip locked','lease_token=p_lease','IDEMPOTENCY_WINDOW_CLOSED','insert into public.cct_outbox'])
    assert.ok(sql.includes(contract),`missing ${contract}`);
  assert.ok(sql.startsWith('-- SOURCE PACKAGE ONLY.'));
  assert.ok(sql.trim().endsWith('commit;'));
});
test('WordPress shortcode uses native assembly, public config, style flush and no financial flag',()=>{
  for(const token of ["add_shortcode('sindratar_cct'","wp_enqueue_style","wp_add_inline_script",
    'wp_print_styles','SINDRATAR_SUPABASE_PUBLIC_KEY','JSON_HEX_TAG'])
    assert.ok(php.includes(token),`missing ${token}`);
  assert.ok(!php.includes('paymentsEnabled'));
});
test('approved member order bypasses unavailable bank and retains server-approved release path',()=>{
  const edge=load('../supabase/functions/sindratar-api/index.ts');
  const legacy=edge.slice(edge.indexOf('const orders = authenticated'));
  assert.ok(legacy.indexOf('if(order.status!=="pending_payment")')<legacy.indexOf('if(!bank.ready)'));
  assert.ok(sql.includes("case when v_member then 'awaiting_release' else 'pending_payment' end"));
  assert.ok(sql.includes("'member_approved','member:'"));
  assert.ok(sql.includes("status='ready',released_at=now()"));
  assert.ok(sql.includes("'documents_ready','ready:'"));
  assert.ok(sql.includes('perform public.cct_try_auto_release(v_order.id)'));
  assert.ok(sql.includes('perform public.cct_try_auto_release(p_order)'));
  assert.ok(sql.includes('AUTO_RELEASE_BLOCKED_PDF'));
  assert.match(sql,/\^\[A-Z0-9\]\{12\}\[0-9\]\{2\}\$/);
});
