// Editorial snapshot only. Never used for eligibility, pricing or PDF release.
export const negotiationSnapshot = {
  year: 2026,
  updatedAt: "2026-10-20T10:30:00-03:00",
  updatedLabel: "20/10/2026 às 10h30",
  sourceUrl: "https://sindratarsp.com.br/solicitar-convencao-coletiva-2/",
  municipalitiesUrl: "https://sindratarsp.com.br/consulta-de-municipios/",
  rows: [
    { name: "Força Sindical", baseMonth: "Novembro", status: "Negociações iniciadas", signed: false },
    { name: "FEM-CUT", baseMonth: "Setembro", status: "Assinado", signed: true },
    { name: "Conlutas", baseMonth: "Setembro", status: "Negociações iniciadas", signed: false },
    { name: "Intersindical", baseMonth: "Setembro", status: "Assinado", signed: true },
    { name: "Campinas", baseMonth: "Setembro", status: "Assinado", signed: true },
  ],
} as const;
