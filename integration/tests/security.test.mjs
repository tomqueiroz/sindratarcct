import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticatedAction, authorizeDownload, normalizeEligibility, validateCnpj,
  validateOrder, verifyReconciliation, UnavailableItauAdapter,
} from '../supabase/functions/_shared/core.mjs';

const now=Date.parse('2026-11-07T12:00:00Z');
const user={id:'owner',email_confirmed_at:'2026-11-01T00:00:00Z'};
const docId='11111111-1111-4111-8111-111111111111';
const companyId='22222222-2222-4222-8222-222222222222';
const order={
  id:'33333333-3333-4333-8333-333333333333',user_id:'owner',status:'ready',total_cents:6911,
  created_at:'2026-11-06T00:00:00Z',recognized_at:'2026-11-06T12:00:00Z',
  released_at:'2026-11-07T10:00:00Z',download_expires_at:'2026-11-08T12:00:00Z',
  payment_expires_at:'2026-11-09T12:00:00Z',
  document_snapshot:[{id:docId,title:'Documento de teste',storagePath:'cct/test/v1.pdf',sha256:'a'.repeat(64)}],
};
const expectCode = code => e => e.code===code;
test('anonymous HTTP request rejected before resolver or action',async()=>{
  let calls=0;
  const handler=authenticatedAction(async()=>{calls++;return user;},async()=>{calls++;return 'ok';});
  await assert.rejects(handler(new Request('https://example.org/download',{method:'POST'})),expectCode('AUTH_REQUIRED'));
  assert.equal(calls,0);
});
test('invalid bearer user rejected',async()=>{
  const handler=authenticatedAction(async()=>null,async()=>assert.fail('action executed'));
  await assert.rejects(handler(new Request('https://example.org/orders',{headers:{authorization:'Bearer invalid'}})),
    expectCode('AUTH_REQUIRED'));
});
test('unverified email cannot purchase or download',()=>{
  assert.throws(()=>authorizeDownload({id:'owner'},order,docId,now),expectCode('EMAIL_VERIFICATION_REQUIRED'));
});
test('matching ready entitlement yields private path and 60s maximum TTL',()=>{
  assert.deepEqual(authorizeDownload(user,order,docId,now),{path:'cct/test/v1.pdf',title:'Documento de teste',ttl:60});
});
test('foreign owner and missing order reveal same 403',()=>{
  for(const candidate of [{...order,user_id:'someone-else'},null])
    assert.throws(()=>authorizeDownload(user,candidate,docId,now),e=>e.status===403 && e.code==='DOWNLOAD_FORBIDDEN');
});
test('expired download rejected including exact expiry boundary',()=>{
  for(const expiry of ['2026-11-06T12:00:00Z','2026-11-07T12:00:00Z'])
    assert.throws(()=>authorizeDownload(user,{...order,download_expires_at:expiry},docId,now),expectCode('DOWNLOAD_FORBIDDEN'));
});
test('refunded/canceled/expired/pending/unreleased orders rejected',()=>{
  for(const status of ['refunded','canceled','expired','pending_payment','awaiting_release'])
    assert.throws(()=>authorizeDownload(user,{...order,status},docId,now),expectCode('DOWNLOAD_FORBIDDEN'));
  assert.throws(()=>authorizeDownload(user,{...order,released_at:null},docId,now),expectCode('DOWNLOAD_FORBIDDEN'));
});
test('foreign document and malicious path rejected',()=>{
  assert.throws(()=>authorizeDownload(user,order,'other',now),expectCode('DOWNLOAD_FORBIDDEN'));
  for(const path of ['https://evil.example/pdf','../private.pdf','cct/../../private.pdf'])
    assert.throws(()=>authorizeDownload(user,{...order,document_snapshot:[{...order.document_snapshot[0],storagePath:path}]},docId,now),
      expectCode('DOWNLOAD_FORBIDDEN'));
});
test('eligibility checks main and secondary CNAE and exact IBGE shape',()=>{
  assert.deepEqual(normalizeEligibility({mainCnae:'43.22-3/02',secondaryCnaes:['4322302','33.14-7/07'],
    municipalityIbge:'3550308'}),{codes:['4322302','3314707'],municipality:'3550308'});
  assert.throws(()=>normalizeEligibility({mainCnae:'123',municipalityIbge:'São Paulo'}),expectCode('INVALID_CNAE'));
});
test('CNPJ check digits validated; repeated dummy numbers blocked',()=>{
  assert.equal(validateCnpj('11.222.333/0001-81'),'11222333000181'); // synthetic validation vector only
  assert.throws(()=>validateCnpj('00.000.000/0000-00'),expectCode('INVALID_CNPJ'));
  assert.throws(()=>validateCnpj('11.222.333/0001-82'),expectCode('INVALID_CNPJ'));
  assert.equal(validateCnpj('12.ABC.345/01DE-35'),'12ABC34501DE35');
  assert.equal(validateCnpj('12.abc.345/01de-35'),'12ABC34501DE35');
  assert.throws(()=>validateCnpj('12.ABC.345/01DE-36'),expectCode('INVALID_CNPJ'));
});
test('browser cannot submit price, paid, benefit or storage path',()=>{
  const input={mainCnae:'4322302',municipalityIbge:'3550308',companyId,documentIds:[docId]};
  assert.equal(validateOrder(input,'idempotency_test_123').key,'idempotency_test_123');
  for(const field of ['price','totalCents','status','paid','member','storagePath','admin'])
    assert.throws(()=>validateOrder({...input,[field]:true},'idempotency_test_123'),expectCode('UNEXPECTED_FIELD'));
});
test('bank reconciliation requires exact order, amount, BRL, reference and verification',()=>{
  const pending={...order,status:'pending_payment'};
  const event={verified:true,orderId:order.id,reference:order.id,amountCents:6911,currency:'BRL',transactionId:'txn-test'};
  assert.equal(verifyReconciliation(pending,event,now),true);
  for(const patch of [{verified:false},{orderId:'foreign'},{reference:'wrong'},{amountCents:6910},{currency:'USD'},{transactionId:''}])
    assert.throws(()=>verifyReconciliation(pending,{...event,...patch},now),expectCode('RECONCILIATION_MISMATCH'));
  assert.throws(()=>verifyReconciliation({...pending,payment_expires_at:'2026-11-07T12:00:00Z'},event,now),
    expectCode('RECONCILIATION_MISMATCH'));
});
test('Itaú unavailable adapter fails closed, never issues demo payment',async()=>{
  const adapter=new UnavailableItauAdapter();
  assert.equal(adapter.ready,false);
  for(const fn of ['createCharge','verifyWebhook','reconcile'])
    await assert.rejects(adapter[fn](),e=>e.status===503 && e.code==='BANK_PRODUCT_NOT_CONFIGURED');
});
