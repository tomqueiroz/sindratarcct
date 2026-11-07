import { negotiationSnapshot } from "./negotiations";

export const digits = (value: string) => value.replace(/\D/g, "");
export function documentType(value: string): "CPF" | "CNPJ" | null {
  const code = value.toUpperCase().replace(/[./\-\s]/g, "");
  if (/^\d{11}$/.test(code)) return "CPF";
  if (/^[A-Z0-9]{12}\d{2}$/.test(code)) return "CNPJ";
  return null;
}
export function phoneMask(value: string) {
  const code = digits(value).slice(0, 11);
  return code.length <= 2 ? code : code.length <= 7
    ? `(${code.slice(0, 2)}) ${code.slice(2)}`
    : `(${code.slice(0, 2)}) ${code.slice(2, 7)}-${code.slice(7)}`;
}
export const serviceFaqs = [
  ["Onde encontro os CNAEs?", "Os CNAEs são os códigos das atividades da empresa. Eles aparecem no cartão CNPJ, nos campos “atividade econômica principal” e “atividades econômicas secundárias”. Copie o principal e, se houver, os secundários."],
  ["Qual cidade devo informar?", "Informe a cidade do estabelecimento para o qual você precisa da CCT. A convenção depende da atividade e da região. O atendimento desta página é para o estado de São Paulo."],
  ["Preciso criar uma conta?", "Não. A solicitação é pontual. As orientações de pagamento e o acesso ao documento serão enviados ao e-mail informado."],
  ["Como recebo o link de pagamento?", "Na operação ativa, o link aparece na etapa de pagamento e também é enviado ao seu e-mail, com cópia para financeiro@sindratarsp.com.br. As opções disponíveis são as liberadas pelo banco."],
  ["Quando recebo a CCT?", "Após o banco confirmar o pagamento, a previsão de envio do acesso à CCT é de até 2 dias úteis. O tempo de confirmação varia conforme a forma de pagamento e o processamento bancário."],
  ["E se minha empresa for associada?", "O benefício depende da confirmação do vínculo pelo SINDRATAR-SP. Para empresas não associadas, o valor informado é R$ 69,11. Se houver dúvida sobre o vínculo, fale com a equipe antes de pagar."],
  ["Como identifico a base sindical da minha cidade?", "Consulte a relação de municípios e bases sindicais no site do SINDRATAR-SP. Informe no formulário a cidade do estabelecimento. A identificação da CCT considera também os CNAEs e o documento vigente no catálogo."],
  ["O status “Assinado” significa que já posso baixar a CCT?", `Não necessariamente. O quadro de negociações reproduz a atualização de ${negotiationSnapshot.updatedLabel} do site oficial; não é uma consulta em tempo real. “Assinado” informa a situação da negociação. A solicitação depende do enquadramento e da disponibilidade do documento correspondente no catálogo.`],
] as const;
