import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth";
import { Layout, PageMeta } from "@/components/cct/Layout";
import { cctApi, brl, showDate, type CctRequest } from "@/lib/cct";

export default function Account({ admin = false }: { admin?: boolean }) {
  const [requests, setRequests] = useState<CctRequest[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const { data: session } = authClient.useSession();
  const load = async () => {
    setBusy(true); setError("");
    try { const data = await cctApi<{ requests: CctRequest[] }>(admin ? "/admin/requests" : "/requests"); setRequests(data.requests); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível consultar os pedidos."); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let active = true;
    cctApi<{ requests: CctRequest[] }>(admin ? "/admin/requests" : "/requests")
      .then(data => { if (active) setRequests(data.requests); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Não foi possível consultar."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [admin]);
  async function saveNote(id: string) {
    setSaving(id); setError("");
    try {
      await cctApi(`/admin/requests/${id}/note`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: note[id] ?? "" }) });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setSaving(""); }
  }
  return <Layout><PageMeta title={admin ? "Gestão de solicitações" : "Meus pedidos"} description="Acompanhamento privado das solicitações de convenção coletiva. Homologação SINDRATAR-SP." />
    <div className="wrap inner-page"><div className="section-kicker">{admin ? "ÁREA DA EQUIPE" : "MINHA CONTA"}</div><h1>{admin ? "Gestão de solicitações" : "Seu pedido, passo a passo."}</h1>
      <p className="lead">{admin ? "Pedidos de homologação e observações da equipe. Cobranças, liberação de arquivos e mensagens reais não estão habilitadas." : `Olá, ${session?.user.name ?? "bem-vindo"}. Consulte os pedidos vinculados à sua conta. Esta homologação não gera cobranças nem envia PDFs.`}</p>
      <div className="page-action-bar"><Link to="/" className="primary-btn btn-link">Nova solicitação →</Link><Button variant="outline" onClick={load} disabled={busy}>{busy ? "Consultando..." : "Atualizar pedidos"}</Button></div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {!busy && !requests.length && !error && <div className="empty-state"><h2>Ainda não há solicitações por aqui.</h2><p>Comece pela consulta dos CNAEs e do município da empresa.</p><Link to="/" className="text-link">Consultar minha empresa →</Link></div>}
      <div className="request-list">{requests.map(item => <article className="request-item" key={item.id}><h2>{item.documentTitle}</h2><p>{item.companyName} · {item.municipality}</p><span className="badge">Homologação · sem cobrança</span><div className="request-meta"><span>Valor de referência: {brl(item.priceCents)}</span><span>Registrado: {showDate(item.createdAt)}</span></div><details><summary>Ver os dados e as próximas etapas <span>+</span></summary><dl><div><dt>Protocolo</dt><dd>{item.id}</dd></div><div><dt>CNPJ</dt><dd>{item.cnpj}</dd></div><div><dt>E-mail da conta</dt><dd>{item.email}</dd></div><div><dt>Base de demonstração</dt><dd>{item.base}</dd></div></dl><div className="status-path"><p><span>✓</span> Registro da solicitação concluído</p><p><span>◷</span> Cobrança real: não habilitada</p><p><span>◷</span> Confirmação bancária: indisponível</p><p><span>◷</span> PDF: não liberado</p></div>{item.operatorNote && <div className="notice"><strong>Observação da equipe</strong><p>{item.operatorNote}</p></div>}{admin && <div><label htmlFor={`note-${item.id}`}>Observação da equipe, visível ao solicitante</label><textarea id={`note-${item.id}`} maxLength={1000} value={note[item.id] ?? item.operatorNote} onChange={e => setNote(prev => ({ ...prev, [item.id]: e.target.value }))} /><Button className="primary-btn" onClick={() => saveNote(item.id)} disabled={saving === item.id}>{saving === item.id ? "Salvando..." : "Salvar observação"}</Button></div>}</details></article>)}</div>
      <div className="notice">O prazo previsto de até 2 dias úteis começa após a confirmação bancária na operação definitiva. Não existe contagem de prazo ou confirmação de pagamento neste teste.</div>
    </div>
  </Layout>;
}
