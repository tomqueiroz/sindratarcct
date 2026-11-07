import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateCpf,validateGuest,bankInstructions,emailCopy} from "../supabase/functions/_shared/guest.mjs";
const payload={codes:["4322302"],municipality:"3509502",documentId:"853a3a99-9c88-41e2-a42e-fd764ee1b94c",
  name:"Teste fictício",position:"RH",cpf:"52998224725",cnpj:"11222333000181",
  companyName:"Empresa de teste",email:"teste@example.invalid",phone:"(11) 99999-9999",website:""};
const key="bec7388c-25b9-4036-bc53-a3f7fa5f8f65";
test("CPF check digits, repeat and invalid input",()=>{
  assert.equal(validateCpf("529.982.247-25"),"52998224725");
  for(const value of ["11111111111","52998224726",null])assert.throws(()=>validateCpf(value));
});
test("guest accepts contact/company and normalizes without Auth identity",()=>{
  const data=validateGuest(payload,key);assert.equal(data.phone,"11999999999");assert.equal(data.key,key);
  assert.equal(data.cnpj,"11222333000181");assert.ok(!("userId" in data));
});
test("guest cannot inject paid state, recipient copy, price or privileges",()=>{
  for(const extra of [{paid:true},{priceCents:0},{cc:"attacker@example.invalid"},{userId:"admin"},{website:"spam"},
    {codes:null},{cpf:"52998224726"},{email:"bad"},{phone:"123"}])
    assert.throws(()=>validateGuest({...payload,...extra},key));
});
test("bank options include only approved HTTPS instructions",()=>{
  const data=bankInstructions({checkoutUrl:"https://bank.example/pay/1",debugSecret:"never"},["bank.example"]);
  assert.equal(data.checkoutUrl,"https://bank.example/pay/1");assert.ok(!("debugSecret" in data));
  for(const target of ["javascript:alert(1)","http://bank.example/pay","https://evil.example/pay","https://user:pass@bank.example/pay"])
    assert.throws(()=>bankInstructions({checkoutUrl:target},["bank.example"]));
});
test("no made-up bank options, only bank-returned pix/boleto",()=>{
  assert.throws(()=>bankInstructions({},["bank.example"]));
  const data=bankInstructions({boletoUrl:"https://bank.example/boleto",pixCode:"000201"+"1".repeat(30)},["bank.example"]);
  assert.equal(data.checkoutUrl,undefined);assert.ok(data.pixCode);
});
test("financial CC only on bank instructions, not bearer document link",()=>{
  assert.deepEqual(emailCopy("payment_instructions"),["financeiro@sindratarsp.com.br"]);
  assert.deepEqual(emailCopy("documents_ready"),[]);
});
test("additional SQL gives no visitor read and enqueues both instruction/finance events",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/202611080001_guest_service.sql",import.meta.url),"utf8");
  for(const term of ["enable row level security","from public,anon,authenticated",
    "cct_guest_idempotency","RATE_LIMITED","INELIGIBLE_DOCUMENT","payment_instructions","finance_ready",
    "user_id is null","token_hash","revoked_at"])assert.ok(sql.includes(term),term);
});
test("private delivery checks state, token hash/expiry and does not query public storage",()=>{
  const edge=readFileSync(new URL("../supabase/functions/sindratar-api/index.ts",import.meta.url),"utf8");
  const guest=edge.slice(edge.indexOf("async function guestDownload"),edge.indexOf("async function resendGuest"));
  for(const term of ["await sha256(input.token)","access.revoked_at",'order.status!=="ready"',
    'db.storage.from("cct-private")',"Math.min(60"])assert.ok(guest.includes(term),term);
});
