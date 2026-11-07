/** Pure business boundaries; shared by Edge handlers and focused Node tests. */
export class CctError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export function requireUser(user) {
  if (!user?.id) throw new CctError('AUTH_REQUIRED', 401);
  if (!user.email_confirmed_at) throw new CctError('EMAIL_VERIFICATION_REQUIRED', 403);
  return user;
}
export function normalizeEligibility(input) {
  if (!input || typeof input !== 'object') throw new CctError('INVALID_INPUT');
  const clean = v => typeof v === 'string' ? v.replace(/[.\-/\s]/g, '') : '';
  const main = clean(input.mainCnae);
  const secondary = input.secondaryCnaes ?? [];
  if (!Array.isArray(secondary) || secondary.length > 19) throw new CctError('INVALID_CNAE');
  const codes = [...new Set([main, ...secondary.map(clean)])];
  if (!codes.every(c => /^\d{7}$/.test(c))) throw new CctError('INVALID_CNAE');
  if (typeof input.municipalityIbge !== 'string' || !/^\d{7}$/.test(input.municipalityIbge))
    throw new CctError('INVALID_MUNICIPALITY');
  return { codes, municipality: input.municipalityIbge };
}
export function validateCnpj(value) {
  const c = typeof value === 'string' ? value.toUpperCase().replace(/[.\-/\s]/g, '') : '';
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(c) || /^(\d)\1+$/.test(c)) throw new CctError('INVALID_CNPJ');
  for (const n of [12, 13]) {
    const weights = n === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const r = c.slice(0,n).split('').reduce((s,d,i) => s + (d.charCodeAt(0)-48)*weights[i], 0)%11;
    if (Number(c[n]) !== (r<2 ? 0 : 11-r)) throw new CctError('INVALID_CNPJ');
  }
  return c;
}
export function validateOrder(input, key) {
  const eligibility = normalizeEligibility(input);
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  if (!uuid.test(input.companyId ?? '') || !Array.isArray(input.documentIds) ||
    input.documentIds.length < 1 || input.documentIds.length > 20 ||
    !input.documentIds.every(d => typeof d === 'string' && uuid.test(d)) ||
    new Set(input.documentIds).size !== input.documentIds.length)
    throw new CctError('INVALID_ORDER');
  if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new CctError('INVALID_IDEMPOTENCY_KEY');
  // Never accept client total, paid, benefit, status, storage path or admin fields.
  const allowed = new Set(['mainCnae','secondaryCnaes','municipalityIbge','companyId','documentIds']);
  if (Object.keys(input).some(k => !allowed.has(k))) throw new CctError('UNEXPECTED_FIELD');
  return { ...eligibility, companyId: input.companyId, documentIds: [...input.documentIds].sort(), key };
}
export function authorizeDownload(user, order, documentId, now = Date.now()) {
  requireUser(user);
  // Do not reveal foreign ownership versus missing resource to the caller.
  if (!order || order.user_id !== user.id) throw new CctError('DOWNLOAD_FORBIDDEN', 403);
  if (order.status !== 'ready' || !order.recognized_at || !order.released_at ||
    !order.download_expires_at || Date.parse(order.download_expires_at) <= now)
    throw new CctError('DOWNLOAD_FORBIDDEN', 403);
  const doc = order.document_snapshot?.find(d => d.id === documentId);
  if (!doc || !/^cct\/[a-zA-Z0-9/_-]+\.pdf$/.test(doc.storagePath ?? '') ||
    !/^[a-f0-9]{64}$/.test(doc.sha256 ?? '')) throw new CctError('DOWNLOAD_FORBIDDEN', 403);
  return { path: doc.storagePath, title: doc.title, ttl: Math.min(60, Math.floor((Date.parse(order.download_expires_at)-now)/1000)) };
}
export function verifyReconciliation(order, event, now = Date.now()) {
  if (!event?.verified || !order || order.status !== 'pending_payment' ||
    event.orderId !== order.id || event.reference !== order.id ||
    event.amountCents !== order.total_cents || event.currency !== 'BRL' ||
    !Number.isSafeInteger(event.amountCents) || !event.transactionId ||
    Date.parse(order.payment_expires_at) <= now) throw new CctError('RECONCILIATION_MISMATCH', 422);
  return true;
}
export async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(b => b.toString(16).padStart(2,'0')).join('');
}
/**
 * Provider contract is deliberately unavailable until the contracted Itaú product,
 * version, auth, mTLS, webhook verification and reconciliation rules are implemented.
 * @typedef {{verified:true,provider:string,eventId:string,payloadHash:string,orderId:string,
 * transactionId:string,reference:string,amountCents:number,currency:'BRL',paidAt:string}} VerifiedBankEvent
 */
export class UnavailableItauAdapter {
  ready = false;
  async createCharge() { throw new CctError('BANK_PRODUCT_NOT_CONFIGURED', 503); }
  /** @returns {Promise<VerifiedBankEvent>} */
  async verifyWebhook() { throw new CctError('BANK_PRODUCT_NOT_CONFIGURED', 503); }
  /** @returns {Promise<VerifiedBankEvent>} */
  async reconcile() { throw new CctError('BANK_PRODUCT_NOT_CONFIGURED', 503); }
}
/** Injected dependencies make request auth rejection testable without external services. */
export function authenticatedAction(resolveUser, action) {
  return async request => {
    const bearer = request.headers.get('authorization');
    if (!bearer?.startsWith('Bearer ')) throw new CctError('AUTH_REQUIRED', 401);
    const user = requireUser(await resolveUser(bearer.slice(7)));
    return action(request,user);
  };
}
