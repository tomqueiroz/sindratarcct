import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import {
  CctError, normalizeEligibility, validateCnpj, validateOrder, sha256,
  authorizeDownload, verifyReconciliation, authenticatedAction,
} from "../_shared/core.mjs";
import { ContractRequired, type VerifiedBankEvent } from "./bank-adapter.ts";
import { validateGuest, bankInstructions, emailCopy } from "../_shared/guest.mjs";

const bank = new ContractRequired();
const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const origins = (Deno.env.get("CCT_ALLOWED_ORIGINS") ?? "").split(",").filter(Boolean);
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const accountUrl = Deno.env.get("CCT_ACCOUNT_URL") ?? "";
function fail(code: string, status = 400): never { throw new CctError(code,status); }
async function rpc(name: string, args: Record<string, unknown>) {
  const { data,error } = await db.rpc(name,args);
  if (error) {
    const exposed = ["IDEMPOTENCY_CONFLICT","FORBIDDEN_COMPANY","INELIGIBLE_DOCUMENT",
      "COMPANY_CLAIM_REQUIRES_STAFF","MIXED_CATALOG","INVALID_INPUT","RATE_LIMITED","INVALID_PRICE"];
    const code = exposed.find(c => error.message.includes(c));
    fail(code ?? "DATABASE_OPERATION_FAILED", code==="RATE_LIMITED" ? 429 : code?.includes("FORBIDDEN") ? 403 : code ? 409 : 503);
  }
  return data;
}
async function body(request: Request) {
  // Bound actual bytes, not just untrusted Content-Length.
  const reader = request.body?.getReader();
  if (!reader) fail("EMPTY_BODY");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); fail("BODY_TOO_LARGE",413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset=0;
  for (const c of chunks) { bytes.set(c,offset); offset+=c.length; }
  return bytes;
}
async function json(request: Request) {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) fail("JSON_REQUIRED",415);
  try { return JSON.parse(new TextDecoder().decode(await body(request))); }
  catch (e) { if (e instanceof CctError) throw e; fail("INVALID_JSON"); }
}
const authenticated = (action: (request: Request,user: {id:string;email:string}) => Promise<unknown>) =>
  authenticatedAction(async (jwt: string) => {
    const { data,error } = await db.auth.getUser(jwt);
    return error ? null : data.user;
  }, action);
async function workerAuth(request: Request) {
  const expected = Deno.env.get("CCT_WORKER_TOKEN");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /,"") ?? "";
  if (!expected || expected.length<32 || supplied.length<32) fail("WORKER_UNAUTHORIZED",401);
  // Fixed-size constant-time comparison of cryptographic digests.
  const a = await sha256(expected), b = await sha256(supplied);
  let difference=0; for(let i=0;i<a.length;i++) difference |= a.charCodeAt(i)^b.charCodeAt(i);
  if(difference!==0) fail("WORKER_UNAUTHORIZED",401);
}
async function reconcile(event: VerifiedBankEvent) {
  const {data: order,error} = await db.from("cct_orders").select("*").eq("id",event.orderId).maybeSingle();
  if(error) fail("DATABASE_OPERATION_FAILED",503);
  // SQL remains authoritative and rechecks under lock, including event duplicates.
  // Do not pre-reject an already accepted duplicate solely because order state changed.
  if(order?.status==="pending_payment") verifyReconciliation(order,event);
  if(!event.verified) fail("UNVERIFIED_EVENT",401);
  return rpc("cct_reconcile_payment",{
    p_provider:event.provider,p_event:event.eventId,p_payload_hash:event.payloadHash,p_order:event.orderId,
    p_transaction:event.transactionId,p_reference:event.reference,p_amount:event.amountCents,
    p_currency:event.currency,p_paid_at:event.paidAt,
  });
}
async function resendEmail(to: string, kind: string, orderId: string, dedup: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("CCT_EMAIL_FROM");
  if (!apiKey || !from || !/^https:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(accountUrl))
    fail("EMAIL_PROVIDER_NOT_CONFIGURED",503);
  const ready = kind==="documents_ready";
  const response = await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","Idempotency-Key":dedup},
    signal:AbortSignal.timeout(15000),
    body:JSON.stringify({
      from,to:[to],subject:ready ? "SINDRATAR-SP — documentos disponíveis" : "SINDRATAR-SP — pedido reconhecido",
      text:ready
        ? `Os documentos do pedido ${orderId} estão disponíveis na sua conta: ${accountUrl}\nO acesso exige autenticação.`
        : `Seu pedido ${orderId} foi reconhecido. A disponibilização ocorre em até 2 dias úteis após o reconhecimento, conforme revisão operacional.\nAcompanhe: ${accountUrl}`,
    }),
  });
  if(!response.ok) fail(response.status===429 ? "EMAIL_RATE_LIMIT" : "EMAIL_PROVIDER_FAILURE",503);
  const data = await response.json();
  if(typeof data.id!=="string") fail("EMAIL_INVALID_RESPONSE",503);
  return data.id;
}
const bankHosts = (Deno.env.get("CCT_BANK_ALLOWED_HOSTS") ?? "").split(",").map(h=>h.trim()).filter(Boolean);
const guestAccessUrl = Deno.env.get("CCT_GUEST_ACCESS_URL") ?? "";
async function guestOrders(request: Request) {
  const input=validateGuest(await json(request),request.headers.get("idempotency-key"));
  // Do not create charges or paid-looking orders while the contracted bank is unavailable.
  if(!bank.ready) fail("BANK_PRODUCT_NOT_CONFIGURED",503);
  const contact={name:input.name,position:input.position,cpf:input.cpf,cnpj:input.cnpj,
    companyName:input.companyName,email:input.email,phone:input.phone};
  const hash=await sha256(JSON.stringify({contact,codes:input.codes,municipality:input.municipality,documentId:input.documentId}));
  const order=await rpc("cct_create_guest_order",{p_key:input.key,p_hash:hash,p_codes:input.codes,
    p_municipality:input.municipality,p_document:input.documentId,p_contact:contact});
  if(order.status!=="pending_payment") return {orderId:order.id,status:order.status,totalCents:order.total_cents};
  const reserved=await rpc("cct_reserve_charge",{p_order:order.id});
  if(reserved.provider_charge_id) return {orderId:order.id,status:order.status,totalCents:order.total_cents,
    instructions:bankInstructions(reserved.public_instructions,bankHosts)};
  const charge=await bank.createCharge({orderId:order.id,reference:order.id,amountCents:order.total_cents,
    currency:"BRL",expiresAt:order.payment_expires_at,idempotencyKey:`charge-${order.id}`});
  const instructions=bankInstructions(charge.instructions,bankHosts);
  // Trigger enqueues the payment email + financial CC transactionally.
  await rpc("cct_record_charge",{p_order:order.id,p_provider_id:charge.providerChargeId,p_instructions:instructions});
  return {orderId:order.id,status:order.status,totalCents:order.total_cents,instructions};
}
async function guestDownload(request: Request) {
  const input=await json(request);
  if(!input || Object.keys(input).some(k=>!["orderId","token"].includes(k)) ||
    typeof input.orderId!=="string" || typeof input.token!=="string" || !/^[a-f0-9]{64}$/.test(input.token))
    fail("ACCESS_INVALID",403);
  const {data:access,error}=await db.from("cct_guest_access").select("order_id,expires_at,revoked_at")
    .eq("token_hash",await sha256(input.token)).eq("order_id",input.orderId).maybeSingle();
  if(error || !access || access.revoked_at || Date.parse(access.expires_at)<=Date.now()) fail("ACCESS_EXPIRED",403);
  const {data:order,error:orderError}=await db.from("cct_orders").select("*").eq("id",access.order_id).is("user_id",null).maybeSingle();
  if(orderError || !order || order.status!=="ready" || !order.recognized_at || !order.released_at || Date.parse(order.download_expires_at)<=Date.now())
    fail("DOCUMENT_NOT_RELEASED",403);
  const ttl=Math.min(60,Math.floor((Date.parse(access.expires_at)-Date.now())/1000),
    Math.floor((Date.parse(order.download_expires_at)-Date.now())/1000));
  if(!Number.isFinite(ttl) || ttl<1) fail("ACCESS_EXPIRED",403);
  const urls=[];
  for(const doc of order.document_snapshot) {
    if(typeof doc.storagePath!=="string" || !/^cct\/[a-zA-Z0-9/_-]+[.]pdf$/.test(doc.storagePath)) fail("DOCUMENT_TEMPORARILY_UNAVAILABLE",503);
    const {data,error:storageError}=await db.storage.from("cct-private").createSignedUrl(doc.storagePath,ttl,{download:"convencao-coletiva.pdf"});
    if(storageError || !data?.signedUrl) fail("DOCUMENT_TEMPORARILY_UNAVAILABLE",503);
    urls.push({title:doc.title,url:data.signedUrl});
  }
  return {documents:urls,expiresIn:ttl};
}
async function resendGuest(to: string,kind: string,orderId: string,dedup: string) {
  const apiKey=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("CCT_EMAIL_FROM");
  if(!apiKey || !from) fail("EMAIL_PROVIDER_NOT_CONFIGURED",503);
  let text=`Solicitação ${orderId}.\n`,subject="SINDRATAR-SP — confirmação de pagamento";
  if(kind==="payment_instructions") {
    const {data:charge,error}=await db.from("cct_charge_requests").select("public_instructions").eq("order_id",orderId).single();
    if(error) fail("CHARGE_NOT_AVAILABLE",503);
    const instructions=bankInstructions(charge.public_instructions,bankHosts);
    subject="SINDRATAR-SP — pagamento da CCT";
    text+=`O link de pagamento foi gerado pelo banco.\n${instructions.checkoutUrl ? `Acesse: ${instructions.checkoutUrl}\n` : ""}${instructions.boletoUrl ? `Boleto: ${instructions.boletoUrl}\n` : ""}${instructions.pixCode ? `Pix copia e cola: ${instructions.pixCode}\n` : ""}Após a confirmação bancária, o acesso à CCT será enviado em até 2 dias úteis. Não é necessário enviar comprovante.`;
  } else if(kind==="documents_ready") {
    if(!/^https:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(guestAccessUrl)) fail("ACCESS_URL_NOT_CONFIGURED",503);
    const bytes=crypto.getRandomValues(new Uint8Array(32));
    const token=[...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
    const {error}=await db.from("cct_guest_access").insert({token_hash:await sha256(token),order_id:orderId,
      expires_at:new Date(Date.now()+7*86400000).toISOString()});
    if(error) fail("ACCESS_ISSUE_FAILED",503);
    // Fragment is not sent to the web server; native page clears it before POST.
    subject="SINDRATAR-SP — sua CCT está disponível";
    text+=`Pagamento confirmado. Acesse a CCT, sem conta ou senha:\n${guestAccessUrl}#acesso=${orderId}&token=${token}\nEste link tem validade de 7 dias. Não o compartilhe. Se expirar, contate a equipe com o protocolo.`;
  } else if(kind==="finance_ready") {
    subject="SINDRATAR-SP — CCT liberada";
    text+="Pagamento reconhecido e CCT liberada ao solicitante. O link privado é enviado somente ao destinatário.";
  } else {
    text+="O pagamento foi confirmado pelo banco. A previsão de envio do acesso à CCT é de até 2 dias úteis.";
  }
  const response=await fetch("https://api.resend.com/emails",{method:"POST",
    headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","Idempotency-Key":dedup},
    signal:AbortSignal.timeout(15000),body:JSON.stringify({from,to:[to],
      ...(emailCopy(kind).filter((address:string)=>address!==to).length ? {cc:emailCopy(kind).filter((address:string)=>address!==to)} : {}),subject,text})});
  if(!response.ok) fail("EMAIL_PROVIDER_FAILURE",503);
  const data=await response.json(); if(typeof data.id!=="string") fail("EMAIL_INVALID_RESPONSE",503);
  return data.id;
}
async function outboxWorker(request: Request) {
  await workerAuth(request);
  const jobs = await rpc("cct_lease_outbox",{p_limit:10});
  const summary = {leased:jobs.length,sent:0,failed:0,skipped:0};
  for(const job of jobs) {
    let message: string|null=null, errorCode: string|null=null;
    try {
      const {data:order,error} = await db.from("cct_orders").select("user_id,status").eq("id",job.order_id).single();
      if(error) fail("OUTBOX_ORDER_MISSING",503);
      if(["refunded","canceled","expired"].includes(order.status)) fail("OUTBOX_ORDER_TERMINAL",409);
      if(job.kind==="payment_instructions" && order.status!=="pending_payment") {
        const acknowledged=await rpc("cct_ack_outbox",{
          p_id:job.id,p_lease:job.lease_token,p_message:"suppressed_obsolete",p_error:null,
        });
        if(acknowledged) summary.skipped++; else summary.failed++;
        continue;
      }
      if(order.user_id) {
        const {data:recipient,error:authError} = await db.auth.admin.getUserById(order.user_id);
        if(authError || !recipient.user?.email) fail("OUTBOX_RECIPIENT_MISSING",503);
        message = await resendEmail(recipient.user.email,job.kind,job.order_id,job.dedup_key);
      } else {
        const {data:contact,error:contactError}=await db.from("cct_guest_contacts").select("email").eq("order_id",job.order_id).single();
        if(contactError || !contact?.email) fail("OUTBOX_RECIPIENT_MISSING",503);
        const recipient=job.kind==="finance_ready" ? "financeiro@sindratarsp.com.br" : contact.email;
        message=await resendGuest(recipient,job.kind,job.order_id,job.dedup_key);
      }
    } catch(e) {
      errorCode = e instanceof CctError ? e.code : "EMAIL_TRANSIENT_FAILURE";
    }
    const acknowledged = await rpc("cct_ack_outbox",{
      p_id:job.id,p_lease:job.lease_token,p_message:message,p_error:errorCode,
    });
    if(acknowledged && !errorCode) summary.sent++; else summary.failed++;
  }
  return summary;
}
const companies = authenticated(async (request,user) => {
  const input = await json(request);
  if(Object.keys(input).some(k=>!["cnpj","legalName"].includes(k))) fail("UNEXPECTED_FIELD");
  const cnpj=validateCnpj(input.cnpj);
  if(typeof input.legalName!=="string" || input.legalName.trim().length<2 || input.legalName.length>160)
    fail("INVALID_COMPANY_NAME");
  return {companyId:await rpc("cct_register_company",{p_user:user.id,p_cnpj:cnpj,p_name:input.legalName.trim()})};
});
const orders = authenticated(async (request,user) => {
  const input=validateOrder(await json(request),request.headers.get("idempotency-key"));
  const requestHash = await sha256(JSON.stringify({
    companyId:input.companyId,codes:[...input.codes].sort(),municipality:input.municipality,
    documentIds:input.documentIds,
  }));
  const order = await rpc("cct_create_order",{
    p_user:user.id,p_company:input.companyId,p_key:input.key,p_hash:requestHash,
    p_codes:input.codes,p_municipality:input.municipality,p_documents:input.documentIds,
  });
  // A real adapter must make this retry-safe by the SAME order id as charge idempotency key.
  // A charge-call failure leaves the pending order intact and retry resumes this exact order.
  if(order.status!=="pending_payment")
    return {orderId:order.id,status:order.status,totalCents:order.total_cents};
  if(!bank.ready) fail("BANK_PRODUCT_NOT_CONFIGURED",503);
  const reserved=await rpc("cct_reserve_charge",{p_order:order.id});
  if(reserved.provider_charge_id)
    return {orderId:order.id,status:order.status,totalCents:order.total_cents,
      charge:{providerChargeId:reserved.provider_charge_id,instructions:reserved.public_instructions}};
  const charge = await bank.createCharge({
    orderId:order.id,reference:order.id,amountCents:order.total_cents,currency:"BRL",
    expiresAt:order.payment_expires_at,idempotencyKey:`charge-${order.id}`,
  });
  await rpc("cct_record_charge",{
    p_order:order.id,p_provider_id:charge.providerChargeId,p_instructions:charge.instructions,
  });
  return {orderId:order.id,status:order.status,totalCents:order.total_cents,charge};
});
const download = authenticated(async (request,user) => {
  const input=await json(request);
  if(Object.keys(input).some(k=>!["orderId","documentId"].includes(k)) ||
    typeof input.orderId!=="string" || typeof input.documentId!=="string") fail("INVALID_DOWNLOAD_REQUEST");
  // Owner filter is duplicated in SQL/RLS. Service-role requires this explicit scope.
  const {data:order,error} = await db.from("cct_orders").select("*").eq("id",input.orderId)
    .eq("user_id",user.id).maybeSingle();
  if(error) fail("DOWNLOAD_FORBIDDEN",403);
  const grant = authorizeDownload(user,order,input.documentId);
  if(grant.ttl<1) fail("DOWNLOAD_FORBIDDEN",403);
  const {data,error:storageError} = await db.storage.from("cct-private")
    .createSignedUrl(grant.path,grant.ttl,{download:"convencao-coletiva.pdf"});
  if(storageError || !data?.signedUrl) fail("DOCUMENT_TEMPORARILY_UNAVAILABLE",503);
  return {url:data.signedUrl,expiresIn:grant.ttl};
});
Deno.serve(async request => {
  const origin=request.headers.get("origin");
  const headers = new Headers({
    "Content-Type":"application/json","Cache-Control":"no-store","Referrer-Policy":"no-referrer",
    "X-Content-Type-Options":"nosniff",
  });
  if(origin && origins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin",origin); headers.set("Vary","Origin");
    headers.set("Access-Control-Allow-Headers","authorization,apikey,content-type,idempotency-key");
    headers.set("Access-Control-Allow-Methods","POST,OPTIONS");
  }
  try {
    if(origin && !origins.includes(origin)) fail("ORIGIN_FORBIDDEN",403);
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers});
    if(request.method!=="POST") fail("METHOD_NOT_ALLOWED",405);
    const action=new URL(request.url).pathname.split("/").filter(Boolean).at(-1);
    let data:unknown;
    if(action==="municipalities") data=await rpc("cct_municipalities",{});
    else if(action==="eligibility") {
      const input=normalizeEligibility(await json(request));
      data=await rpc("cct_eligibility",{p_codes:input.codes,p_municipality:input.municipality});
    } else if(action==="guest-orders") data=await guestOrders(request);
    else if(action==="guest-download") data=await guestDownload(request);
    else if(action==="companies") data=await companies(request);
    else if(action==="orders") data=await orders(request);
    else if(action==="download") data=await download(request);
    else if(action==="payment-webhook") data=await reconcile(await bank.verifyWebhook(await body(request),request.headers));
    else if(action==="outbox-run") data=await outboxWorker(request);
    else if(action==="reconcile") {
      await workerAuth(request);
      const input=await json(request);
      if(typeof input.providerChargeId!=="string" || input.providerChargeId.length>160) fail("INVALID_INPUT");
      data=await reconcile(await bank.reconcile(input.providerChargeId));
    } else fail("NOT_FOUND",404);
    return new Response(JSON.stringify({ok:true,data}),{status:200,headers});
  } catch(error) {
    // No tokens, CNPJ/email, raw webhook body, signed URL or provider response in logs.
    const status=error instanceof CctError ? error.status : 503;
    const code=error instanceof CctError ? error.code
      : error instanceof Error && error.message==="BANK_PRODUCT_NOT_CONFIGURED"
      ? "BANK_PRODUCT_NOT_CONFIGURED" : "SERVICE_UNAVAILABLE";
    return new Response(JSON.stringify({ok:false,error:{code}}),{status,headers});
  }
});
