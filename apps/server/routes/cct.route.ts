import { Hono, type Context } from "hono";
import { z } from "zod";
import { bodyLimit } from "hono/body-limit";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { publicRoute, protectedRoute, adminRoute } from "../_core/route-helpers";
import { checkEligibility, demoCnaes } from "../services/cct-rules";
import { addOperatorNote, createRequest, listRequests } from "../services/cct";
import { createGuestRequest, guestSchema, listGuestRequests, noteGuestRequest } from "../services/cct-guest";

const eligibilitySchema = z.object({
  primaryCnae: z.string().trim().min(7).max(12),
  secondaryCnaes: z.array(z.string().trim().min(7).max(12)).max(30),
  municipality: z.string().trim().min(2).max(100),
}).strict();
const requestSchema = eligibilitySchema.extend({
  companyName: z.string().trim().min(3).max(150),
  cnpj: z.string().trim().min(14).max(20),
  documentId: z.string().max(40),
  idempotencyKey: z.string().uuid(),
}).strict();
export const cctRouter = new Hono();
cctRouter.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });
cctRouter.get("/catalog", publicRoute, (c) => c.json(apiSuccess({
  demo: true, paymentEnabled: false, emailEnabled: false, priceCents: 6911,
  cnaes: Object.entries(demoCnaes).map(([code, description]) => ({ code, description })),
  municipalities: ["Campinas", "São Paulo", "Sorocaba", "São José dos Campos", "Santos", "Cubatão"],
})));
cctRouter.post("/eligibility", publicRoute, async (c) => {
  const parsed = eligibilitySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Confira os campos da consulta."), 400);
  try { return c.json(apiSuccess(checkEligibility(parsed.data))); }
  catch (error) { return c.json(apiFailure("INVALID_CNAE", error instanceof Error ? error.message : "Código inválido."), 400); }
});
cctRouter.post("/service/requests", publicRoute, bodyLimit({ maxSize: 16384, onError: c => c.json(apiFailure("BODY_TOO_LARGE", "A solicitação excedeu o tamanho permitido."), 413) }), async c => {
  const parsed = guestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues.find(i => ["cpf", "cnpj", "phone"].includes(String(i.path[0])))?.message;
    return c.json(apiFailure("INVALID_INPUT", message ?? "Confira os dados do solicitante, o e-mail e a empresa."), 400);
  }
  try { return c.json(apiSuccess(await createGuestRequest(parsed.data)), 201); }
  catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "RATE_LIMITED") return c.json(apiFailure(code, "Aguarde antes de enviar outra solicitação ou fale com a equipe."), 429);
    if (code === "IDEMPOTENCY_CONFLICT") return c.json(apiFailure(code, "Os dados mudaram. Revise e envie uma nova solicitação."), 409);
    if (code === "INELIGIBLE_DOCUMENT") return c.json(apiFailure(code, "Verifique os CNAEs e a cidade novamente."), 400);
    throw error;
  }
});
const listHandler = async (c: Context) => c.json(apiSuccess({ requests: await listRequests(c.var.currentUser.id) }));
cctRouter.get("/requests", protectedRoute, listHandler);
cctRouter.get("/requests/", protectedRoute, listHandler);
cctRouter.post("/requests", protectedRoute, async (c) => {
  const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Confira os dados da empresa e a versão selecionada."), 400);
  try {
    const request = await createRequest(c.var.currentUser.id, c.var.currentUser.email, parsed.data);
    return c.json(apiSuccess({ request, paymentEnabled: false, emailSent: false }), 201);
  } catch (error) {
    if (error instanceof Error && /CNPJ|Selecione/.test(error.message)) return c.json(apiFailure("INVALID_REQUEST", error.message), 400);
    throw error;
  }
});
cctRouter.post("/requests/:id/payment", protectedRoute, c => c.json(apiFailure("PAYMENT_NOT_ENABLED", "Cobranças não estão habilitadas nesta homologação. Nenhum pagamento foi gerado."), 503));
cctRouter.get("/requests/:id/download", protectedRoute, c => c.json(apiFailure("DOCUMENT_NOT_RELEASED", "Nenhum PDF real está disponível nesta homologação."), 403));
cctRouter.get("/admin/requests", adminRoute, async c => c.json(apiSuccess({ requests: [...await listGuestRequests(), ...await listRequests()].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,100) })));
cctRouter.patch("/admin/requests/:id/note", adminRoute, async c => {
  const parsed = z.object({ note: z.string().trim().max(1000) }).strict().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "A observação deve ter até 1.000 caracteres."), 400);
  const legacy = await addOperatorNote(c.req.param("id"), parsed.data.note);
  const request = legacy[0] ?? (await noteGuestRequest(c.req.param("id"), parsed.data.note))[0];
  return request ? c.json(apiSuccess({ request })) : c.json(apiFailure("NOT_FOUND", "Pedido não encontrado."), 404);
});
