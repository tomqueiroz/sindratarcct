import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../_core/db";
import { cctGuestLimits, cctGuestRequests } from "../db/schema";
import { checkEligibility, isValidCnpj, isValidCpf } from "./cct-rules";

export const guestSchema = z.object({
  primaryCnae: z.string().trim().min(7).max(12),
  secondaryCnaes: z.array(z.string().trim().min(7).max(12)).max(30),
  municipality: z.string().trim().min(2).max(100),
  state: z.literal("SP"),
  name: z.string().trim().min(3).max(120),
  position: z.string().trim().min(1).max(80),
  cpf: z.string().trim().max(14).refine(isValidCpf, "Confira o CPF do solicitante."),
  cnpj: z.string().trim().max(20).refine(isValidCnpj, "Confira o CNPJ da empresa."),
  companyName: z.string().trim().min(3).max(150),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().transform(s => s.replace(/\D/g, "")).refine(s => /^[1-9]\d9\d{8}$/.test(s), "Informe um celular válido com DDD."),
  documentId: z.string().max(40),
  idempotencyKey: z.string().uuid(),
  website: z.literal(""),
}).strict();
export function guestFingerprint(input: z.infer<typeof guestSchema>) {
  const values = Object.fromEntries(Object.entries(input).filter(([key]) => !["idempotencyKey", "website"].includes(key)));
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}
export async function createGuestRequest(input: z.infer<typeof guestSchema>) {
  const db = getDb();
  const hash = guestFingerprint(input);
  const existing = await db.select().from(cctGuestRequests).where(eq(cctGuestRequests.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existing[0]) {
    if (existing[0].requestHash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
    return { protocol: existing[0].id, paymentEnabled: false, emailSent: false };
  }
  const eligibility = checkEligibility(input);
  const doc = eligibility.documents.find(d => d.id === input.documentId);
  if (!doc || eligibility.documents.length !== 1) throw new Error("INELIGIBLE_DOCUMENT");
  const now = new Date();
  // Atomic persistent limits; production additionally requires edge/WAF protection.
  const emailBucket = createHash("sha256").update(input.email).digest("hex");
  const buckets = [`email:${emailBucket}:${now.toISOString().slice(0, 13)}`, `global:${now.toISOString().slice(0, 13)}`];
  await db.delete(cctGuestLimits).where(lt(cctGuestLimits.expiresAt, now.toISOString()));
  for (const bucket of buckets) {
    const limit = bucket.startsWith("email:") ? 5 : 100;
    const rows = await db.insert(cctGuestLimits).values({ bucket, hits: 1, expiresAt: new Date(now.getTime() + 7200000).toISOString() })
      .onConflictDoUpdate({ target: cctGuestLimits.bucket, set: { hits: sql`${cctGuestLimits.hits} + 1` }, setWhere: lt(cctGuestLimits.hits, limit) }).returning();
    if (!rows.length) throw new Error("RATE_LIMITED");
  }
  const inserted = await db.insert(cctGuestRequests).values({
    id: randomUUID(), idempotencyKey: input.idempotencyKey, requestHash: hash,
    name: input.name, position: input.position, cpf: input.cpf.replace(/\D/g, ""), phone: input.phone,
    companyName: input.companyName, cnpj: input.cnpj.toUpperCase().replace(/[./\-\s]/g, ""),
    email: input.email, municipality: input.municipality, state: "SP",
    primaryCnae: input.primaryCnae.replace(/\D/g, ""), secondaryCnaes: JSON.stringify(input.secondaryCnaes),
    documentId: doc.id, documentTitle: doc.title, base: doc.base, priceCents: doc.priceCents,
    status: "homologacao", createdAt: now.toISOString(), updatedAt: now.toISOString(),
  }).onConflictDoNothing().returning();
  const row = inserted[0] ?? (await db.select().from(cctGuestRequests).where(and(eq(cctGuestRequests.idempotencyKey, input.idempotencyKey), eq(cctGuestRequests.requestHash, hash))).limit(1))[0];
  if (!row) throw new Error("IDEMPOTENCY_CONFLICT");
  // The protocol cannot retrieve personal data, payments or documents.
  return { protocol: row.id, paymentEnabled: false, emailSent: false };
}
export async function listGuestRequests() {
  return getDb().select().from(cctGuestRequests).orderBy(desc(cctGuestRequests.createdAt)).limit(100);
}
export async function noteGuestRequest(id: string, note: string) {
  return getDb().update(cctGuestRequests).set({ operatorNote: note, updatedAt: new Date().toISOString() }).where(eq(cctGuestRequests.id, id)).returning();
}
