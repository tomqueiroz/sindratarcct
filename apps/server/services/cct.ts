import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../_core/db";
import { cctRequests } from "../db/schema";
import { checkEligibility, isValidCnpj, type EligibilityInput } from "./cct-rules";

export type RequestInput = EligibilityInput & { companyName: string; cnpj: string; documentId: string; idempotencyKey: string };
export async function createRequest(userId: string, email: string, input: RequestInput) {
  if (!isValidCnpj(input.cnpj)) throw new Error("Confira o CNPJ e os dígitos verificadores.");
  const eligibility = checkEligibility(input);
  const doc = eligibility.documents.find(item => item.id === input.documentId);
  if (!doc) throw new Error("Selecione uma versão correspondente à consulta de demonstração.");
  const db = getDb();
  const existing = await db.select().from(cctRequests).where(and(eq(cctRequests.userId, userId), eq(cctRequests.idempotencyKey, input.idempotencyKey))).limit(1);
  if (existing[0]) return existing[0];
  const date = new Date().toISOString();
  const inserted = await db.insert(cctRequests).values({
    id: crypto.randomUUID(), userId, idempotencyKey: input.idempotencyKey,
    companyName: input.companyName, cnpj: input.cnpj.toUpperCase().replace(/[./\-\s]/g, ""),
    email, municipality: input.municipality, primaryCnae: input.primaryCnae.replace(/\D/g, ""),
    secondaryCnaes: JSON.stringify(input.secondaryCnaes), documentId: doc.id,
    documentTitle: doc.title, base: doc.base, priceCents: doc.priceCents,
    status: "homologacao", createdAt: date, updatedAt: date,
  }).onConflictDoNothing().returning();
  if (inserted[0]) return inserted[0];
  const winner = await db.select().from(cctRequests).where(and(eq(cctRequests.userId, userId), eq(cctRequests.idempotencyKey, input.idempotencyKey))).limit(1);
  if (!winner[0]) throw new Error("Não foi possível registrar. Tente novamente com o mesmo pedido.");
  return winner[0];
}
export async function listRequests(userId?: string) {
  return getDb().select().from(cctRequests).where(userId ? eq(cctRequests.userId, userId) : undefined).orderBy(desc(cctRequests.createdAt)).limit(100);
}
export async function addOperatorNote(id: string, note: string) {
  return getDb().update(cctRequests).set({ operatorNote: note, updatedAt: new Date().toISOString() }).where(eq(cctRequests.id, id)).returning();
}
