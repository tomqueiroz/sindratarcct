import { apiFetch } from "@/lib/api";
export type DocumentOption = { id: string; base: string; title: string; period: string; priceCents: number; demo: boolean };
export type Eligibility = { outcome: string; matches: { code: string; description: string }[]; bases: string[]; documents: DocumentOption[]; message: string; demo: boolean };
export type CctRequest = {
  id: string; companyName: string; cnpj: string; email: string; municipality: string;
  base: string; documentTitle: string; status: string; priceCents: number;
  createdAt: string; updatedAt: string; operatorNote: string;
  name?: string; position?: string; phone?: string;
};
export async function cctApi<T>(path: string, init?: RequestInit) {
  const response = await apiFetch(`/cct${path}`, init);
  const body = await response.json() as { ok: boolean; data: T; error?: { message: string } };
  if (!response.ok || !body.ok) throw new Error(body.error?.message ?? "Não foi possível concluir. Tente novamente.");
  return body.data;
}
export const formatCode = (value: string) => {
  const code = value.replace(/\D/g, "");
  return code.length === 7 ? `${code.slice(0,4)}-${code[4]}/${code.slice(5)}` : value;
};
export const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const showDate = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
