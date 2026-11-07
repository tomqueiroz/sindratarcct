import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { guestSchema, guestFingerprint } from "../services/cct-guest";
import { isValidCpf } from "../services/cct-rules";
import { documentType, phoneMask } from "../../client/src/lib/service-form";

vi.mock("../services/cct-guest", async original => ({
  ...await original<typeof import("../services/cct-guest")>(),
  createGuestRequest: vi.fn(async () => ({ protocol: "test-only", paymentEnabled: false, emailSent: false })),
  listGuestRequests: vi.fn(async () => []),
}));
import { cctRouter } from "../routes/cct.route";
const example = {
  primaryCnae: "4322-3/02", secondaryCnaes: [], municipality: "Campinas", state: "SP",
  name: "Solicitante de teste", position: "RH", cpf: "529.982.247-25",
  cnpj: "11.222.333/0001-81", companyName: "Empresa fictícia", email: "teste@example.invalid",
  phone: "(11) 99999-9999", documentId: "demo-cct-1",
  idempotencyKey: "853a3a99-9c88-41e2-a42e-fd764ee1b94c", website: "",
};
const app=()=>{const a=new Hono();a.use("*",async(c,next)=>{c.set("user",null);await next();});a.route("/api/cct",cctRouter);return a;};
const send=(data: unknown)=>app().request("/api/cct/service/requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
describe("service form without requester account",()=>{
  it("recognizes CPF, numeric and alphanumeric CNPJ",()=>{
    expect(documentType(example.cpf)).toBe("CPF");expect(documentType(example.cnpj)).toBe("CNPJ");
    expect(documentType("12.ABC.345/01DE-35")).toBe("CNPJ");expect(documentType("123")).toBe(null);
  });
  it("formats WhatsApp without duplicating punctuation",()=>{
    expect(phoneMask("11999999999")).toBe("(11) 99999-9999");expect(phoneMask("(11) 99999-9999")).toBe("(11) 99999-9999");
  });
  it("checks CPF verification digits and rejects repeats",()=>{
    expect(isValidCpf(example.cpf)).toBe(true);expect(isValidCpf("52998224726")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
  });
  it("validates contact and company without an account identifier",()=>{
    const data=guestSchema.parse(example);expect(data.phone).toBe("11999999999");expect(data.email).toBe(example.email);
    expect("userId" in data).toBe(false);
  });
  it("rejects privileged fields, honeypot, wrong UF and invalid contacts",()=>{
    for(const change of [{status:"paid"},{userId:"other"},{priceCents:1},{website:"bot"},{state:"RJ"},{email:"invalid"},{cpf:"123"},{cnpj:"00000000000000"},{phone:"123"}])
      expect(guestSchema.safeParse({...example,...change}).success).toBe(false);
  });
  it("fingerprint is stable across key changes, but changes with contact",()=>{
    const data=guestSchema.parse(example);
    expect(guestFingerprint(data)).toBe(guestFingerprint({...data,idempotencyKey:crypto.randomUUID()}));
    expect(guestFingerprint(data)).not.toBe(guestFingerprint({...data,email:"other@example.invalid"}));
  });
  it("guest can submit, without receiving PII, payment or delivery claims",async()=>{
    const response=await send(example);expect(response.status).toBe(201);
    expect((await response.json()).data).toEqual({protocol:"test-only",paymentEnabled:false,emailSent:false});
  });
  it("invalid data returns a correction message, never silently succeeds",async()=>{
    const response=await send({...example,cpf:"52998224726"});expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("CPF");
  });
  it("no public guest listing or document retrieval exists",async()=>{
    expect((await app().request("/api/cct/service/requests")).status).toBe(404);
    expect((await app().request("/api/cct/admin/requests")).status).toBe(401);
    expect((await app().request("/api/cct/requests/known/download")).status).toBe(401);
  });
});
