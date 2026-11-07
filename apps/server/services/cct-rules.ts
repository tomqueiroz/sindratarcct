export const onlyCode = (value: string) => value.replace(/\D/g, "");
export const normalizeCity = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
export const demoCnaes: Record<string, string> = {
  "4322302": "Instalação de sistemas de ventilação, refrigeração e aquecimento",
  "2823200": "Fabricação de máquinas e aparelhos de refrigeração e ventilação",
  "2824101": "Fabricação de aparelhos de ar-condicionado para uso industrial",
};
// Explicitly provisional. Never authorizes a real payment or document release.
export const demoCities: Record<string, string[]> = {
  "campinas": ["Campinas"], "sao paulo": ["Força Sindical"], "sorocaba": ["FEMCUT"],
  "sao jose dos campos": ["Conlutas"], "santos": ["Intersindical"],
  "cubatão": ["Força Sindical", "Intersindical"], "cubatao": ["Força Sindical", "Intersindical"],
};
export const demoDocuments = ["Campinas", "Força Sindical", "FEMCUT", "Conlutas", "Intersindical"].map((base, i) => ({
  id: `demo-cct-${i + 1}`, base, title: `Convenção Coletiva — ${base}`,
  period: "Versão demonstrativa • catálogo a confirmar", priceCents: 6911, demo: true,
}));
export type EligibilityInput = { primaryCnae: string; secondaryCnaes: string[]; municipality: string };
export function checkEligibility(input: EligibilityInput) {
  const codes = [...new Set([onlyCode(input.primaryCnae), ...input.secondaryCnaes.map(onlyCode)])];
  if (codes.some(code => !/^\d{7}$/.test(code)) || codes.length > 31) throw new Error("Confira os CNAEs: cada código deve ter 7 dígitos.");
  const matches = codes.filter(code => demoCnaes[code]).map(code => ({ code, description: demoCnaes[code] }));
  const bases = demoCities[normalizeCity(input.municipality)] ?? [];
  const outcome = !matches.length ? "not_matched" : bases.length !== 1 ? "review" : "demo_matched";
  return {
    outcome, matches, bases, demo: true, rulesVersion: "demo-v1",
    documents: outcome === "demo_matched" ? demoDocuments.filter(doc => doc.base === bases[0]) : [],
    message: outcome === "demo_matched"
      ? "Correspondência na base de demonstração. Não representa aprovação de enquadramento sindical."
      : outcome === "not_matched"
        ? "Nenhum CNAE corresponde à base de demonstração. Solicite uma análise de enquadramento."
        : "Município sem correspondência única. A definição da base depende de análise do SINDRATAR-SP.",
  };
}
export function isValidCnpj(value: string) {
  const code = value.toUpperCase().replace(/[./\-\s]/g, "");
  if (!/^[A-Z0-9]{12}\d{2}$/.test(code) || /^(\d)\1{13}$/.test(code)) return false;
  const digit = (part: string, weights: number[]) => {
    const sum = [...part].reduce((acc, char, i) => acc + (char.charCodeAt(0) - 48) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return digit(code.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]) === Number(code[12])
    && digit(code.slice(0, 13), [6,5,4,3,2,9,8,7,6,5,4,3,2]) === Number(code[13]);
}
export function isValidCpf(value: string) {
  const code = value.replace(/[.\-\s]/g, "");
  if (!/^\d{11}$/.test(code) || /^(\d)\1{10}$/.test(code)) return false;
  const digit = (size: number) => {
    const remainder = [...code.slice(0, size)].reduce((sum, c, i) => sum + Number(c) * (size + 1 - i), 0) * 10 % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(code[9]) && digit(10) === Number(code[10]);
}
