import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Layout, PageMeta } from "@/components/cct/Layout";
import { Help } from "@/components/cct/Help";
import { Negotiations } from "@/components/cct/Negotiations";
import { negotiationSnapshot } from "@/lib/negotiations";
import { brl, cctApi, formatCode, type Eligibility } from "@/lib/cct";
import { documentType, phoneMask, serviceFaqs } from "@/lib/service-form";

const steps = [
  ["Atividade da empresa", "Informe os CNAEs e a cidade."],
  ["Dados da solicitação", "Preencha um formulário rápido."],
  ["Pagamento", "Escolha uma opção do banco."],
];
const receiptUrl = "https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp";
type Fields = { primaryCnae: string; secondary: string; municipality: string; state: string; name: string; position: string; identity: string; cpf: string; cnpj: string; companyName: string; email: string; phone: string; website: string };
const initial: Fields = { primaryCnae: "", secondary: "", municipality: "", state: "SP", name: "", position: "", identity: "", cpf: "", cnpj: "", companyName: "", email: "", phone: "", website: "" };
type Receipt = { protocol: string; paymentEnabled: boolean; emailSent: boolean };

export default function Index() {
  const [fields, setFields] = useState<Fields>(initial);
  const [step, setStep] = useState(0);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Receipt | null>(null);
  const [accepted, setAccepted] = useState(false);
  const panel = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(0);
  const key = useRef("");
  useEffect(() => {
    // Keep the institutional header visible on initial load, especially on mobile.
    // Focus the form heading only after the user actually changes step.
    if (previousStep.current !== step) panel.current?.focus();
    previousStep.current = step;
  }, [step]);
  const update = (name: keyof Fields, value: string) => {
    key.current = "";
    setFields(prev => ({ ...prev, [name]: value }));
  };
  const secondaryCnaes = fields.secondary.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const doc = eligibility?.documents[0];
  const kind = documentType(fields.identity);
  const cpf = kind === "CPF" ? fields.identity : fields.cpf;
  const cnpj = kind === "CNPJ" ? fields.identity : fields.cnpj;
  const go = (next: number) => { setError(""); setStep(next); };
  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setEligibility(null);
    try {
      if (fields.state !== "SP") throw new Error("Esta página atende empresas em São Paulo. Para outra UF, fale com a equipe.");
      const data = await cctApi<Eligibility>("/eligibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ primaryCnae: fields.primaryCnae, secondaryCnaes, municipality: fields.municipality }) });
      setEligibility(data);
      if (data.outcome === "demo_matched" && data.documents.length === 1) go(1);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível verificar. Tente novamente."); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (!kind) throw new Error("Confira o campo CPF ou CNPJ. Informe o documento completo.");
      if (!doc || !accepted) throw new Error("Confira os dados e confirme o e-mail para continuar.");
      if (!key.current) key.current = crypto.randomUUID();
      const data = await cctApi<Receipt>("/service/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        primaryCnae: fields.primaryCnae, secondaryCnaes, municipality: fields.municipality, state: fields.state,
        companyName: fields.companyName, cnpj, cpf, name: fields.name, position: fields.position,
        email: fields.email, phone: fields.phone, documentId: doc.id, idempotencyKey: key.current, website: fields.website,
      }) });
      setResult(data); go(2);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Não foi possível registrar. Seus dados permanecem no formulário.";
      setError(message);
      if (/CPF/.test(message)) document.getElementById(kind === "CPF" ? "identity" : "cpf")?.focus();
      else if (/CNPJ/.test(message)) document.getElementById(kind === "CNPJ" ? "identity" : "cnpj")?.focus();
      else if (/celular/i.test(message)) document.getElementById("phone")?.focus();
    }
    finally { setBusy(false); }
  }
  return <Layout>
    <PageMeta title="Solicitar Convenção Coletiva" description="Solicite a CCT em três passos, sem criar conta. Consulte CNAEs, municípios e a atualização das negociações coletivas de 2026 do SINDRATAR-SP." />
    <div className="service-breadcrumb"><div className="wrap"><a href="https://sindratarsp.com.br/" target="_blank" rel="noopener noreferrer">SINDRATAR-SP</a><span aria-hidden="true">›</span><span>Convenção Coletiva</span></div></div>
    <header className="service-title"><div className="wrap"><h1>Solicitar Convenção Coletiva</h1><p>Obtenha a CCT correspondente à atividade e à região da sua empresa.</p></div></header>
    <div className="wrap service-page">
      <div className="service-start"><h2>Uma solicitação em 3 passos</h2><p>Informe a atividade da empresa, preencha seus dados e siga para o pagamento. As orientações chegam por e-mail, sem criar uma conta.</p></div>
      <Negotiations />
      <div className="service-demo" role="note"><strong>Versão de teste.</strong> Use dados fictícios. A base é demonstrativa e não há cobrança, envio de e-mail ou PDF real.</div>
      <div className="service-grid">
        <aside className="service-rail">
          <p className="service-rail-title">SUA SOLICITAÇÃO</p>
          <ol aria-label="Progresso da solicitação">{steps.map(([title, caption], i) => <li key={title} className={step === i ? "is-current" : step > i ? "is-done" : ""} aria-current={step === i ? "step" : undefined}>
            <span className="service-step-dot" aria-hidden="true">{step > i ? "✓" : i + 1}</span><div><strong>{title}</strong><small>{step > i ? "Concluído" : caption}</small></div>
          </li>)}</ol>
          <div className="service-rail-help"><strong>Precisa de ajuda?</strong><a href="https://sindratarsp.com.br/contato/" target="_blank" rel="noopener noreferrer">Fale com o SINDRATAR-SP ↗</a></div>
          <p className="service-rail-mail">Depois do pagamento, a confirmação e o acesso à CCT chegam por e-mail.</p>
        </aside>
        <section className="service-panel" aria-busy={busy}>
          <div className="service-panel-top"><span>PASSO {step + 1} DE 3</span><small>Campos com * são obrigatórios</small></div>
          <h2 ref={panel} tabIndex={-1}>{["Informe a atividade da empresa", "Preencha os dados da solicitação", "Pagamento da solicitação"][step]}</h2>
          <p className="service-intro">{["Use os CNAEs do cartão CNPJ e a cidade do estabelecimento.", "Encontramos uma CCT na base de teste. Agora, informe quem está solicitando e os dados da empresa.", "Confira o resumo. Na operação ativa, as opções de pagamento aparecem nesta tela."][step]}</p>
          {error && <div className="notice error" role="alert">{error}</div>}
          {step === 0 && <form onSubmit={verify}><fieldset disabled={busy} className="service-form-fields">
            <div className="service-two"><div><div className="service-label"><label htmlFor="primary">CNAE principal *</label><Help label="Onde encontro os CNAEs?">São os códigos das atividades no cartão CNPJ. Copie o código da atividade principal.</Help></div>
              <Input id="primary" placeholder="Ex.: 4322-3/02" inputMode="numeric" value={fields.primaryCnae} onChange={e => update("primaryCnae", e.target.value)} maxLength={12} required /></div>
              <div><label htmlFor="secondary">CNAEs secundários <small>(se houver)</small></label><Input id="secondary" placeholder="Ex.: 2823-2/00, 2824-1/01" value={fields.secondary} onChange={e => update("secondary", e.target.value)} maxLength={400} /><p className="field-hint">Separe os códigos por vírgula.</p></div></div>
            <a className="service-receita" href={receiptUrl} target="_blank" rel="noopener noreferrer">Consultar o cartão CNPJ na Receita Federal ↗</a>
            <div className="service-city"><div><div className="service-label"><label htmlFor="municipality">Cidade *</label><Help label="Qual cidade devo informar?">A cidade do estabelecimento para o qual você precisa da CCT.</Help></div><Input id="municipality" placeholder="Digite ou selecione a cidade" list="cities" value={fields.municipality} onChange={e => update("municipality", e.target.value)} required maxLength={100} /><datalist id="cities">{["Campinas", "São Paulo", "Sorocaba", "São José dos Campos", "Santos", "Cubatão"].map(city => <option key={city} value={city} />)}</datalist></div>
              <div><label htmlFor="state">UF *</label><select id="state" value={fields.state} onChange={e => update("state", e.target.value)}><option value="SP">SP</option></select></div></div>
            <p className="field-hint">Atendimento para estabelecimentos no estado de São Paulo. <a href={negotiationSnapshot.municipalitiesUrl} target="_blank" rel="noopener noreferrer">Consultar municípios e bases sindicais ↗</a></p>
            {eligibility && (eligibility.outcome !== "demo_matched" || eligibility.documents.length !== 1) && <div className="notice warning" role="status"><strong>Precisamos conferir o enquadramento.</strong><p>Não encontramos uma correspondência única na base de teste. Confira os códigos e a cidade ou peça orientação à equipe.</p><a href="https://sindratarsp.com.br/faca-o-enquadramento/" target="_blank" rel="noopener noreferrer">Pedir orientação ↗</a></div>}
            <div className="service-actions"><span>Para testar: 4322-3/02 · Campinas</span><Button type="submit" className="primary-btn" disabled={busy}>{busy ? "Verificando..." : "Verificar e continuar"} →</Button></div>
          </fieldset></form>}
          {step === 1 && <form onSubmit={save}><fieldset disabled={busy} className="service-form-fields">
            <div className="service-match"><span aria-hidden="true">✓</span><div><strong>{doc?.title}</strong><small>{fields.municipality}/SP · CNAE {formatCode(eligibility?.matches[0]?.code ?? "")} · versão demonstrativa</small></div><button type="button" onClick={() => go(0)}>Alterar</button></div>
            <fieldset className="service-fieldset"><legend>Dados do solicitante</legend>
              <div className="service-two"><div><label htmlFor="name">Nome completo *</label><Input id="name" placeholder="Ex.: Maria Oliveira" value={fields.name} onChange={e => update("name", e.target.value)} autoComplete="name" minLength={3} maxLength={120} required /></div><div><label htmlFor="position">Cargo *</label><Input id="position" placeholder="Ex.: responsável pelo RH" value={fields.position} onChange={e => update("position", e.target.value)} autoComplete="organization-title" maxLength={80} required /></div></div>
              <div className="service-two"><div><div className="service-label"><label htmlFor="identity">CPF ou CNPJ *</label><Help label="Como funciona o campo CPF ou CNPJ?">Informe seu CPF ou o CNPJ da empresa. Identificamos o tipo sem pedir que você escolha. O CPF do solicitante será pedido apenas se ainda não tiver sido informado.</Help></div><Input id="identity" placeholder="Digite o CPF ou CNPJ" value={fields.identity} onChange={e => update("identity", e.target.value.toUpperCase())} maxLength={20} required aria-describedby="identity-hint" /><p id="identity-hint" className="field-hint">{kind ? `${kind} identificado.` : "Pode digitar com ou sem pontuação."}</p></div>
              <div>{kind === "CNPJ" ? <><label htmlFor="cpf">CPF do solicitante *</label><Input id="cpf" placeholder="000.000.000-00" inputMode="numeric" value={fields.cpf} onChange={e => update("cpf", e.target.value)} maxLength={14} required /></> : <><label htmlFor="phone">Celular com WhatsApp *</label><Input id="phone" type="tel" placeholder="(11) 99999-9999" autoComplete="tel-national" value={fields.phone} onChange={e => update("phone", phoneMask(e.target.value))} maxLength={15} required /><p className="field-hint">Informe o DDD.</p></>}</div></div>
              <div className={kind === "CNPJ" ? "service-two" : ""}><div><label htmlFor="email">E-mail para receber a CCT *</label><Input id="email" type="email" autoComplete="email" placeholder="Ex.: maria@empresa.com.br" value={fields.email} onChange={e => update("email", e.target.value)} maxLength={254} required /></div>{kind === "CNPJ" && <div><label htmlFor="phone">Celular com WhatsApp *</label><Input id="phone" type="tel" placeholder="(11) 99999-9999" autoComplete="tel-national" value={fields.phone} onChange={e => update("phone", phoneMask(e.target.value))} maxLength={15} required /></div>}</div>
            </fieldset>
            <fieldset className="service-fieldset"><legend>Empresa solicitante</legend><div className="service-two">
              <div><label htmlFor="cnpj">CNPJ da empresa *</label><Input id="cnpj" placeholder="00.000.000/0000-00" value={cnpj} readOnly={kind === "CNPJ"} onChange={e => update("cnpj", e.target.value.toUpperCase())} maxLength={20} required /><p className="field-hint">{kind === "CNPJ" ? "Preenchido a partir do documento acima." : "CNPJ do estabelecimento consultado."}</p></div>
              <div><label htmlFor="company">Razão social *</label><Input id="company" placeholder="Nome da empresa no cartão CNPJ" value={fields.companyName} onChange={e => update("companyName", e.target.value)} autoComplete="organization" minLength={3} maxLength={150} required /></div></div>
            </fieldset>
            <div className="service-honeypot" aria-hidden="true"><label htmlFor="website">Deixe vazio</label><input id="website" value={fields.website} onChange={e => update("website", e.target.value)} tabIndex={-1} autoComplete="off" /></div>
            <div className="service-review"><div><span>Valor para não associadas</span><strong>{brl(doc?.priceCents ?? 6911)}</strong></div><p>Associadas: confirme o benefício com a equipe antes de pagar.</p></div>
            <label className="checkbox-label"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} required /><span>Conferi os dados e o e-mail <strong>{fields.email || "informado acima"}</strong>. Eles serão usados para esta solicitação e suas comunicações.</span></label>
            <div className="service-actions"><button type="button" className="service-back" onClick={() => go(0)}>← Voltar</button><Button className="primary-btn" disabled={busy || !accepted} type="submit">{busy ? "Registrando..." : "Continuar para pagamento"} →</Button></div>
          </fieldset></form>}
          {step === 2 && <div>
            <div className="service-match"><span aria-hidden="true">✓</span><div><strong>Solicitação de teste registrada</strong><small>Protocolo: {result?.protocol}</small></div></div>
            <div className="service-final-summary"><div><span>Convenção</span><strong>{doc?.title}</strong></div><div><span>Empresa</span><strong>{fields.companyName}</strong></div><div><span>Enviar para</span><strong>{fields.email}</strong></div><div><span>Valor</span><strong>{brl(doc?.priceCents ?? 6911)}</strong></div></div>
            <div className="service-bank-empty"><h3>Pagamento ainda não disponível nesta versão</h3><p>Quando o banco estiver conectado, esta área exibirá o link de pagamento e somente as opções habilitadas: Pix com QR code e código para copiar, boleto para baixar ou checkout bancário.</p><button className="service-bank-button" disabled>Abrir página de pagamento do banco</button><small>Nenhum link, boleto ou código Pix foi gerado.</small></div>
            <div className="service-email-note"><h3>O que acontece depois?</h3><p>O link e as instruções de pagamento serão enviados para <strong>{fields.email}</strong>, com cópia para <strong>financeiro@sindratarsp.com.br</strong>.</p><p>Após a confirmação do banco, você receberá o acesso à CCT por e-mail em até <strong>2 dias úteis</strong>. Não precisa enviar comprovante nem criar uma conta.</p><small>Nesta versão de teste, nenhum e-mail é enviado.</small></div>
            <div className="service-actions"><button className="service-back" type="button" onClick={() => { setFields(initial); setEligibility(null); setResult(null); setAccepted(false); key.current = ""; go(0); }}>Iniciar outra solicitação</button><a href="https://sindratarsp.com.br/contato/" target="_blank" rel="noopener noreferrer">Preciso de ajuda ↗</a></div>
          </div>}
        </section>
      </div>
      <section id="duvidas" className="service-faq"><h2>Dúvidas frequentes</h2>{serviceFaqs.map(([q,a], i) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}{i === 0 && <> <a href={receiptUrl} target="_blank" rel="noopener noreferrer">Consultar cartão CNPJ ↗</a></>}{q === "Como identifico a base sindical da minha cidade?" && <> <a href={negotiationSnapshot.municipalitiesUrl} target="_blank" rel="noopener noreferrer">Consultar municípios ↗</a></>}{q === "O status “Assinado” significa que já posso baixar a CCT?" && <> <a href={negotiationSnapshot.sourceUrl} target="_blank" rel="noopener noreferrer">Ver atualizações oficiais ↗</a></>}</p></details>)}</section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: serviceFaqs.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })) }).replace(/</g, "\\u003c") }} />
    </div>
  </Layout>;
}
