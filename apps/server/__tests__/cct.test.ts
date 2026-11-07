import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { checkEligibility, isValidCnpj } from "../services/cct-rules";

vi.mock("../services/cct", () => ({
  listRequests: vi.fn(async (owner: string | undefined) => owner ? [{ id: "owned", userId: owner }] : []),
  createRequest: vi.fn(async () => ({ id: "new", status: "homologacao", priceCents: 6911 })),
  addOperatorNote: vi.fn(async () => []),
}));
vi.mock("../services/cct-guest", async (original) => ({
  ...await original<typeof import("../services/cct-guest")>(),
  listGuestRequests: vi.fn(async () => []),
  noteGuestRequest: vi.fn(async () => []),
  createGuestRequest: vi.fn(async () => ({ protocol: "guest-test", paymentEnabled: false, emailSent: false })),
}));
import { cctRouter } from "../routes/cct.route";

const query = { primaryCnae: "4322-3/02", secondaryCnaes: [], municipality: "Campinas" };
describe("CCT generic rules: never a production authorization", () => {
  it("matches principal only as demonstration", () => {
    const result = checkEligibility(query);
    expect(result.outcome).toBe("demo_matched");
    expect(result.demo).toBe(true);
    expect(result.documents[0].priceCents).toBe(6911);
    expect(result.documents[0].demo).toBe(true);
  });
  it("checks secondary codes even when principal is not in example list", () => {
    expect(checkEligibility({ ...query, primaryCnae: "1234567", secondaryCnaes: ["2823-2/00"] }).matches[0].code).toBe("2823200");
  });
  it("deduplicates principal and secondary", () => {
    expect(checkEligibility({ ...query, secondaryCnaes: ["4322302"] }).matches).toHaveLength(1);
  });
  it("rejects malformed secondary code", () => {
    expect(() => checkEligibility({ ...query, secondaryCnaes: ["123"] })).toThrow();
  });
  it("unknown CNAE cannot choose document", () => {
    const data = checkEligibility({ ...query, primaryCnae: "1234567" });
    expect(data.outcome).toBe("not_matched"); expect(data.documents).toHaveLength(0);
  });
  it("multiple bases fail closed into review", () => {
    const data = checkEligibility({ ...query, municipality: "Cubatão" });
    expect(data.outcome).toBe("review"); expect(data.documents).toHaveLength(0);
  });
  it("unknown city fails closed", () => {
    expect(checkEligibility({ ...query, municipality: "Não cadastrada" }).outcome).toBe("review");
  });
  it("normalizes São Paulo accents and spaces", () => {
    expect(checkEligibility({ ...query, municipality: "  SÃO PAULO " }).bases).toEqual(["Força Sindical"]);
  });
  it("validates CNPJ check digits and rejects repeats", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });
  it("supports alphanumeric CNPJ while preserving numeric check digits", () => {
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12.ABC.345/01DE-36")).toBe(false);
  });
});
describe("CCT API ownership and privilege gates", () => {
  function app(role?: "user" | "admin") {
    const server = new Hono();
    server.use("*", async (c, next) => {
      c.set("user", role ? { id: "owner-a", email: "test@example.invalid", role, emailVerified: true, name: "Teste" } : null);
      await next();
    });
    server.route("/api/cct", cctRouter);
    return server;
  }
  it("public eligibility is available; mutations remain gated", async () => {
    expect((await app().request("/api/cct/eligibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query) })).status).toBe(200);
    expect((await app().request("/api/cct/requests", { method: "POST", body: "{}" })).status).toBe(401);
  });
  it("guest cannot list personal requests", async () => {
    expect((await app().request("/api/cct/requests")).status).toBe(401);
  });
  it("list uses current user instead of userId query parameter", async () => {
    const response = await app("user").request("/api/cct/requests?userId=owner-b");
    const body = await response.json();
    expect(body.data.requests[0].userId).toBe("owner-a");
  });
  it("admin gate rejects guest and regular user", async () => {
    expect((await app().request("/api/cct/admin/requests")).status).toBe(401);
    expect((await app("user").request("/api/cct/admin/requests")).status).toBe(403);
    expect((await app("admin").request("/api/cct/admin/requests")).status).toBe(200);
  });
  it("cannot claim paid status or change price via extra fields", async () => {
    const response = await app("user").request("/api/cct/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...query, companyName: "Empresa de teste", cnpj: "11222333000181", documentId: "demo-cct-1", idempotencyKey: crypto.randomUUID(), status: "paid", priceCents: 1 }) });
    expect(response.status).toBe(400);
  });
  it("payment and files remain unavailable for authenticated users", async () => {
    expect((await app("user").request("/api/cct/requests/test/payment", { method: "POST" })).status).toBe(503);
    expect((await app("user").request("/api/cct/requests/test/download")).status).toBe(403);
  });
});
