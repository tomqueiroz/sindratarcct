import { CctError, validateCnpj } from "./core.mjs";
export function validateCpf(value) {
  const code = String(value ?? "").replace(/[.\-\s]/g, "");
  if (!/^\d{11}$/.test(code) || /^(\d)\1{10}$/.test(code)) throw new CctError("INVALID_CPF",400);
  const digit = n => {
    const r = [...code.slice(0,n)].reduce((sum,c,i) => sum+Number(c)*(n+1-i),0)*10%11;
    return r===10 ? 0 : r;
  };
  if(digit(9)!==Number(code[9]) || digit(10)!==Number(code[10])) throw new CctError("INVALID_CPF",400);
  return code;
}
export function validateGuest(input,key) {
  if(!input || typeof input!=="object" || Array.isArray(input)) throw new CctError("INVALID_INPUT",400);
  const allowed=["codes","municipality","documentId","name","position","cpf","cnpj","companyName","email","phone","website"];
  if(Object.keys(input).some(k=>!allowed.includes(k)) || input.website!=="") throw new CctError("INVALID_INPUT",400);
  const text=(name,max) => {
    if(typeof input[name]!=="string" || input[name].trim().length<2 || input[name].length>max)
      throw new CctError("INVALID_INPUT",400);
    return input[name].trim();
  };
  if(!Array.isArray(input.codes)) throw new CctError("INVALID_INPUT",400);
  const codes=[...new Set(input.codes)];
  if(codes.length<1 || codes.length>20 || codes.some(c=>typeof c!=="string" || !/^\d{7}$/.test(c)) ||
    typeof input.municipality!=="string" || !/^\d{7}$/.test(input.municipality) ||
    typeof input.documentId!=="string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.documentId) ||
    typeof key!=="string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key)) throw new CctError("INVALID_INPUT",400);
  const email=text("email",254).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CctError("INVALID_EMAIL",400);
  const phone=text("phone",20).replace(/\D/g,"");
  if(!/^[1-9]\d9\d{8}$/.test(phone)) throw new CctError("INVALID_PHONE",400);
  return {codes:codes.sort(),municipality:input.municipality,documentId:input.documentId,key,
    name:text("name",120),position:text("position",80),cpf:validateCpf(input.cpf),
    cnpj:validateCnpj(input.cnpj),companyName:text("companyName",150),email,phone};
}
export function bankInstructions(value,hosts) {
  if(!value || typeof value!=="object") throw new CctError("BANK_INVALID_INSTRUCTIONS",503);
  const url=(v) => {
    if(v===undefined || v===null || v==="") return undefined;
    const u=new URL(v);
    if(u.protocol!=="https:" || u.username || u.password || !hosts.includes(u.hostname) || u.hash)
      throw new CctError("BANK_INVALID_INSTRUCTIONS",503);
    return u.href;
  };
  const checkoutUrl=url(value.checkoutUrl), boletoUrl=url(value.boletoUrl), pixQrImageUrl=url(value.pixQrImageUrl);
  const pixCode=typeof value.pixCode==="string" && value.pixCode.length>=20 && value.pixCode.length<=1024 ? value.pixCode : undefined;
  if(!checkoutUrl && !boletoUrl && !pixCode) throw new CctError("BANK_INVALID_INSTRUCTIONS",503);
  return {checkoutUrl,boletoUrl,pixQrImageUrl,pixCode};
}
export function emailCopy(kind) {
  // Financial copy does not receive bearer download capabilities or CPF.
  return kind==="payment_instructions" ? ["financeiro@sindratarsp.com.br"] : [];
}
