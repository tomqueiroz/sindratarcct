import { negotiationSnapshot as snapshot } from "@/lib/negotiations";

export function Negotiations() {
  return <details className="service-negotiations" id="negociacoes">
    <summary><div><strong>Negociações coletivas · {snapshot.year}</strong><small>Atualização informada pelo SINDRATAR-SP: <time dateTime={snapshot.updatedAt}>{snapshot.updatedLabel}</time></small></div><span aria-hidden="true">+</span></summary>
    <div className="service-negotiations-body">
      <p>Consulte a situação das negociações por base sindical. A data-base é o mês de referência da negociação.</p>
      <table><caption>Status das negociações por central sindical — {snapshot.year}</caption><thead><tr><th scope="col">Base sindical</th><th scope="col">Data-base</th><th scope="col">Situação informada</th></tr></thead>
        <tbody>{snapshot.rows.map(row => <tr key={row.name}><th scope="row">{row.name}</th><td>{row.baseMonth}</td><td><span className={`negotiation-status ${row.signed ? "is-signed" : "is-pending"}`}>{row.status}</span></td></tr>)}</tbody>
      </table>
      <p className="service-negotiations-note">Este quadro reproduz a atualização acima, não uma consulta em tempo real. “Assinado” indica a situação da negociação; a CCT disponível para sua empresa ainda depende do CNAE, do município e do documento vigente no catálogo.</p>
      <div className="service-negotiations-links"><a href={snapshot.municipalitiesUrl} target="_blank" rel="noopener noreferrer">Consultar municípios e bases sindicais ↗</a><a href={snapshot.sourceUrl} target="_blank" rel="noopener noreferrer">Ver atualizações no site oficial ↗</a></div>
    </div>
  </details>;
}
