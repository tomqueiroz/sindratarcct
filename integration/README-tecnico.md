# SINDRATAR-SP — integração CCT

**Pacote de código-fonte para homologação. Não implantado nem testado ao vivo.** Nenhuma migração, função, bucket, conta, cobrança ou e-mail foi aplicado externamente. O projeto informado é `lbrtshklxkhvlewwdpfb`; a autorização do usuário foi recebida, mas não há conexão técnica disponível nesta sessão. A prévia React/Hono é separada e não comprova esta integração.

## Conteúdo

- `wordpress/pagina-cct-servico.html`: página de serviço nativa pt-BR, CSS isolado, logo oficial, **três etapas** e coluna de progresso à esquerda. CNAEs/cidade → solicitante e empresa → pagamento. Sem conta, senha ou SDK Auth. `pagina-convencoes-sindratar.html` é uma cópia de compatibilidade da mesma versão, não outro fluxo.
- `wordpress/sindratar-cct.php`: shortcode `[sindratar_cct]`, CSS/JS enfileirados, marcação nativa sem iframe. HTML é fonte única da interação. Pagamento não tem flag pública de ativação.
- `supabase/migrations/202611070001_cct.sql`: Postgres, RLS em todas as tabelas `cct_*`, empresas/vínculos, catálogo versionado e relações muitos-para-muitos, pedidos/snapshots imutáveis, pagamentos, deduplicação persistente, outbox transacional e logs sem PII. Auth administra credenciais; não existe tabela própria de senhas.
- `supabase/migrations/202611080001_guest_service.sql`: migração adicional, aplicada depois da primeira, para solicitações pontuais sem usuário Auth. Contatos privados com RLS, idempotência, limites persistentes, capacidades de acesso e notificações financeiras. Não altera pedidos históricos para torná-los públicos.
- `supabase/functions/sindratar-api/`: `guest-orders`, `guest-download`, elegibilidade, webhook/reconciliação e worker de e-mails. Adaptador Itaú tipado **indisponível/503** até contrato e protocolo validados. As rotas autenticadas anteriores são mantidas apenas para compatibilidade de registros internos, não fazem parte do fluxo público novo.
- `tests/`: testes determinísticos do núcleo utilizado pelos handlers e verificações estruturais do pacote.

R$ 69,11 é referência por documento para não associados; preço final vem do catálogo aprovado no servidor. Benefício depende de vínculo aprovado, responsável e vigência, nunca de checkbox. Benefício aprovado não depende de banco e não gera cobrança: inicia `awaiting_release` e tenta liberação automática do snapshot revisado. Pagamento verificado também tenta liberação automática na mesma transação; falta de PDF conserva estado bloqueado para recuperação operacional. Não há catálogo ou PDF oficial fornecido.

## Checklist de ativação

1. Receber manual da agência, CCTs/PDFs oficiais, SHA-256, vigências, tabela jurídica de CNAEs e bases territoriais. Os exemplos não comprovam enquadramento. Revisar preço e política de acesso (`access_days` tem padrão técnico de 365 dias, ainda não aprovado comercialmente).
2. Aprovar LGPD, retenção, operadores, responsáveis técnico/jurídico/financeiro, calendário e alertas. Criar staging separado, com backup/restauração comprovados.
3. Revisar/aplicar as duas migrações, em ordem, por ferramenta oficial Supabase ou SQL Editor **em ambiente autorizado**. Não foram aplicadas nesta entrega. Testar visitantes, dois protocolos/tokens distintos, equipe e RLS/RPCs em Postgres real antes de produção.
4. Importar catálogo em transação ainda rascunho (`published=false`, `is_demo=true`): versão → CNAEs → municípios IBGE/SP → documentos → ambas associações `cct_document_cnaes` e `cct_document_bases`. FKs compostas impedem cruzamento de versões. Substituir exemplos integralmente por dados legais revisados.
5. Subir PDFs privados como `cct/<versao>/<id>.pdf`, **sem sobrescrever/upsert**; conferir SHA-256, MIME e existência; marcar `pdf_verified_at`; revisar preço em centavos (6911 = R$ 69,11) e vigência. Só então preencher `reviewed_at`, `is_demo=false`, `published=true`. Versões publicadas são imutáveis; correções exigem versão nova.
6. Configurar domínio de e-mail, URLs permitidas e proteção antiabuso. A solicitação pública não usa Supabase Auth; Auth/IAM continua necessário para a equipe. Usar chave pública/publishable no WordPress; secrets exclusivamente no ambiente Edge/worker.
7. Configurar `SUPABASE_SERVICE_ROLE_KEY`, `CCT_WORKER_TOKEN` aleatório ≥32 caracteres, `RESEND_API_KEY`, e futuro material bancário **fora do cliente/Git/chat**. Configurar `CCT_ALLOWED_ORIGINS` (origens exatas), `CCT_GUEST_ACCESS_URL` (URL HTTPS da página WordPress sem query/fragmento), `CCT_BANK_ALLOWED_HOSTS` (hosts reais aprovados do banco, sem curingas) e `CCT_EMAIL_FROM` de domínio verificado. `CCT_ACCOUNT_URL` só serve às rotas internas legadas.
8. Contratar o produto Itaú realmente adequado a PIX/boleto. Implementar `BankAdapter` pela documentação dessa versão: OAuth/mTLS, canonicalização/assinatura, validade temporal, replay, reconciliação independente, cancelamento/estorno. Não inventar endpoint/assinatura nem confiar apenas no IP de origem.
9. Adapter deve preservar referência UUID do pedido, valor inteiro em centavos e BRL, filtrar apenas instruções públicas e garantir idempotência por `charge-<pedido>`. Timeout não autoriza segunda cobrança: recuperar/repetir a mesma chave. A reserva e o identificador/instruções públicas da cobrança persistem em `cct_charge_requests`; confirmar recuperação externa dessa chave pelo produto contratado.
10. Implantar função em ambiente autorizado. `verify_jwt=false` permite webhook/público no gateway, mas **não remove** validação `auth.getUser(jwt)` das rotas privadas, token do worker e autenticação bancária do webhook. Aplicar rate limit/WAF e revisar limite atual de corpo de 16 KiB conforme contrato.
11. Configurar execução real da outbox/reconciliação e alertas. **Nenhum cron foi ativado ou presumido**. Se o banco exigir mTLS ou IP de saída estático não suportado em Edge, usar worker segregado AWS (Lambda/contêiner com rede/certificados apropriados), mantendo banco/Auth/Storage no Supabase. Confirmar capacidades, quotas e custos.
12. Homologar jornada real sem conta: consulta → formulário CPF/CNPJ → cobrança idempotente → e-mail do banco com CC financeiro → pagamento verificado → e-mail com acesso privado → download. Testar erro/reenvio de e-mail, divergência, replay, timeout, expiração e estorno. O adaptador bloqueado impede emissão de cobranças agora. Benefício de associada não é presumido pelo CNPJ informado: precisa de confirmação da equipe antes de cobrar.

## WordPress e CSP

Copiar `wordpress` para `wp-content/plugins/sindratar-cct`, incluindo `assets/slots/brand.header.png`; ativar e inserir `[sindratar_cct]` em página dedicada. A versão avulsa usa `/assets/slots/brand.header.png`; servir o arquivo ali. O plugin resolve a logo em sua própria pasta.

Identidade revisada a partir da página oficial de solicitação: títulos Montserrat, textos Open Sans, azul `#29abe2` nos controles e `#40c8ff` na navegação, branco/cinza e faixa de título preta. Textos escuros nos botões ciano preservam legibilidade. A logo oficial horizontal fornecida é mantida, sem redesenho. No shortcode, o cabeçalho/logo do tema permanece e a logo avulsa interna é ocultada para evitar duplicação. Desativar apenas o título automático desta página no template/Elementor para manter um único H1; não alterar o cabeçalho global.

### Negociações e atualizações

O quadro expansível reproduz **2026 / atualização de 20/10/2026 às 10h30**, conforme a página oficial consultada nesta revisão: Força Sindical (novembro, negociações iniciadas), FEM-CUT (setembro, assinado), Conlutas (setembro, negociações iniciadas), Intersindical (setembro, assinado) e Campinas (setembro, assinado). Inclui links para a fonte e para a consulta oficial de municípios.

É conteúdo editorial datado, **não sincronizado automaticamente**. “Assinado” não publica PDF, não prova enquadramento nem permite cobrar/liberar uma convenção. A triagem, preço e arquivos continuam sob o catálogo aprovado do servidor. A lista de municípios do site também não foi importada como regra jurídica. Para atualizar: conferir a fonte com a equipe, editar o snapshot React em `apps/client/src/lib/negotiations.ts` e os mesmos dados/data no HTML nativo; sincronizar as cópias e executar `reference-content.test.mjs`. Uma nova CCT exige também a revisão/versionamento separado do catálogo e do PDF.

Configurar somente identificadores **públicos**, sem comprovação implícita de conexão:

```php
define('SINDRATAR_SUPABASE_URL', 'https://lbrtshklxkhvlewwdpfb.supabase.co');
define('SINDRATAR_SUPABASE_PUBLIC_KEY', 'SUBSTITUIR_PELA_CHAVE_PUBLICA');
```

Autorizar o origin exato na função e configurar `CCT_GUEST_ACCESS_URL` para a própria página. Não inserir service-role, Resend, certificado ou credencial bancária nesses valores. Testar shortcode no tema/Gutenberg adotado; usar apenas um formulário por página. Nenhum iframe em produção.

Não há SDK externo de autenticação na nova página. Recomenda-se localizar as fontes. Integrar CSP ao site inteiro: `script-src 'self'` + nonce/hash dos inline; `connect-src 'self' https://<projeto>.supabase.co`; `style-src 'self'` + nonce/hash e a origem de fontes, se usada; `font-src 'self'`; `img-src 'self'` + os hosts aprovados de QR code do banco; `object-src 'none'`; `base-uri 'self'`; `frame-ancestors` conforme política do site. Aplicar nonces/hashes aos inline enfileirados pelo WordPress no tema/proxy e conferir o header efetivo. Não liberar `unsafe-eval`.

## Autoridade e operação

POST `/functions/v1/sindratar-api/{municipalities|eligibility|guest-orders|guest-download|payment-webhook|reconcile|outbox-run}`. Municípios são carregados por nome do catálogo aprovado; códigos IBGE ficam internos. Elegibilidade pública exige versão publicada/revisada/não demonstrativa, PDF verificado, atividade principal **ou** secundária e município. Correspondência múltipla exige revisão, não escolha automática. Contatos não entram em empresa/vínculo Auth existente pelo simples conhecimento do CNPJ.

Pedido recebe `codes`, IBGE, `documentId`, nome/cargo/CPF/e-mail/celular e CNPJ/razão social. O campo inteligente aceita CPF ou CNPJ; CPF do solicitante e CNPJ da empresa continuam distintos semanticamente, mas cada um é digitado só uma vez. Validar no servidor, inclusive dígitos verificadores. Formulário não envia PII em URL, analytics, browser storage ou logs. A confirmação visual do e-mail evita pedir digitação duplicada. O CPF solicitado deve ter necessidade/fundamento aprovados no aviso LGPD.

RPC revalida elegibilidade única e preço no catálogo. Mesma chave/hash retorna mesmo pedido; mudança retorna conflito. Browser não pode gravar pago/status/admin/preço/benefício nem executar RPC privilegiado. Snapshots congelam documentos e valores. RLS não dá leitura de pedidos sem `user_id` a visitantes ou contas Auth; somente o serviço/IAM pode consultar.

Reconhecimento exige evento verificado pelo adapter ou consulta bancária independente, pedido/referência/valor/BRL/transação exatos e data válida. Evento, pagamento, estado, liberação automática e outbox são **uma transação**. `cct_try_auto_release` confirma objetos privados do snapshot já revisado e gera `ready`/e-mail automaticamente; falta de PDF bloqueia e registra exceção. Equipe usa `cct_release_order` somente na recuperação de exceções após corrigir arquivos. Canal administrativo deve ter autenticação/IAM e trilha de auditoria; não expor RPCs de serviço ao navegador. Este pacote não cria operador inicial nem painel administrativo de produção.

Pagamento gera e-mail com instruções reais sanitizadas do banco e CC fixo `financeiro@sindratarsp.com.br`; destinatário financeiro não vem do navegador. Enviar confirmação após o evento reconhecido; enviar acesso privado ao solicitante quando `ready`. Financeiro recebe notificação separada de liberação, **sem CPF nem token de download**. Sem recibo de envio do provedor, a UI não afirma “e-mail enviado”.

Download recebe `orderId/token`, nunca caminho/URL. Token aleatório de 256 bits é emitido somente para e-mail de documento liberado e armazenado apenas como SHA-256, com validade técnica de 7 dias (a aprovar). O token vai no fragmento da URL, removido pelo JS antes do POST; desativar click-tracking/analytics de links sensíveis e conferir política de logs do provedor. Cada acesso revalida ordem, token, revogação, `ready` e validade antes de gerar URL Storage de no máximo 60s. Re-downloads são permitidos até expiração: não é link de uso único. Reenvio solicitado pela equipe deve revogar todos os tokens anteriores da ordem e emitir notificação com nova chave; **não há endpoint público de reenvio** nem autoalteração de destinatário. IAM/rotina de reenvio ainda precisa de ativação operacional.

## Falhas e recuperação

- PK persistente `(provider,event_id)` deduplica eventos; mesmo ID/hash diferente é colisão. Transação bancária é única por provedor; pedido tem um pagamento. Divergência permanece rejeitada, sem liberação.
- Falha antes do commit reverte evento/pagamento/outbox; evento pode ser repetido. Falha depois é recuperada pela dedup. Recusa de autenticação não vira evento verificado.
- Timeout de cobrança conserva pedido/reserva; adapter precisa recuperar a mesma chave. Charge ID/instruções são persistidos após resposta; falha entre resposta bancária e persistência usa a mesma chave externa, nunca nova cobrança.
- Pagamento tardio/divergente exige revisão financeira. Fallback: API/extrato oficial, conferência referência/valor e dupla revisão; registrar decisão de estorno/reaplicação autorizada/novo pedido. Screenshot do cliente não comprova recebimento.
- Outbox tem `FOR UPDATE SKIP LOCKED`, lease/token 120s, ACK apenas do lease vigente, oito tentativas, backoff e estado morto. Resend usa chave estável e timeout 15s. Em retry de envio de acesso, tokens já emitidos permanecem válidos: a primeira mensagem pode já ter sido aceita pelo provedor; não revogar durante retry técnico. Rotina de reenvio humano deve revogar tokens e usar nova identidade de notificação.
- Envio e ACK SQL não são transação distribuída. Retry usa a mesma chave se houver crash após envio. Resend documenta idempotência 24h; SQL interrompe após 23h. Fora da janela, consultar provedor e revisar; não reenviar cegamente. Mudança de destinatário/conteúdo para mesma chave pode gerar conflito: criar nova notificação aprovada, sem reutilizar a identidade.
- Monitorar filas mortas, leases, atraso, pagamentos divergentes e pedidos aguardando revisão. Logs só códigos/IDs técnicos/contagens: nunca CNPJ/e-mail, JWT, body bruto, credenciais ou URL assinada.

## SLA, continuidade, LGPD e custos

**Até 2 dias úteis após reconhecimento do pagamento**, não após clique/emissão de boleto. Usar `America/Sao_Paulo`, corte de expediente e calendário de feriados nacionais/estaduais/municipais aprovados. SQL usa `timestamptz` e data corrente Postgres; definir fuso operacional antes de ativar. O pacote não calcula prazo jurídico nem garante automaticamente SLA: equipe precisa acompanhar calendário e fila.

Backup do banco **não inclui bytes dos PDFs no Storage**. Manter cópia privada/versionada e inventário de hashes; testar restore de banco e bucket; conciliar outbox/banco após restore de backup antigo para evitar reenvio. Definir RPO/RTO por contrato/risco, não inventar números. Fazer restore drill antes da produção e periodicamente; registrar perda/tempo observados e critérios de aceite. Não há rollback destrutivo automático.

LGPD: identificar controlador/operadores, fundamento aplicável, aviso de privacidade, minimização, segregação de ambiente, atendimento ao titular, retenção jurídica/contábil e expurgo/anonymização. Testar exclusão Auth e FKs sem apagar guarda financeira necessária. Dados de associação/filiação exigem análise jurídica do contexto. Nenhum prazo de retenção ou rotina de expurgo está ativado.

Custos dependem de planos/volume/contratos: Supabase DB/Auth/Edge/Storage/egress/backup-PITR, hospedagem WordPress, domínio/Resend, tarifas Itaú, observabilidade e eventual worker AWS/rede/certificados. Obter cotações e limites reais; nenhum número monetário foi inventado.

## Evidências e lacunas

`node --test integration/tests/security.test.mjs`: **13/13 passaram**. Testes determinísticos do núcleo compartilhado: anônimo, bearer inválido, e-mail não verificado, proprietário correto/estrangeiro, expirado/reembolsado/cancelado/pendente/não liberado, documento/caminho, CNAE/CNPJ numérico e alfanumérico, campos privilegiados, reconciliação exata e adapter indisponível. Não são testes de banco remoto ou pagamento real.

`source-contract.test.mjs` verifica sintaxe JS da LP de três passos, RLS da base, invariantes SQL/WordPress e a compatibilidade da liberação. `guest.test.mjs` verifica CPF, dados pontuais, campos privilegiados, URLs bancárias permitidas, CC e RLS adicional. São verificações de fonte, não execução Postgres/Edge/PHP nem homologação de banco/e-mail.

`reference-content.test.mjs` verifica os cinco status/data-base/data da referência, a consistência das cópias HTML, tipografia/cores, FAQs e a separação entre conteúdo editorial e autorização do servidor.

## Fontes

- [SINDRATAR-SP — Solicitar Convenção Coletiva](https://sindratarsp.com.br/solicitar-convencao-coletiva-2/): identidade visual e quadro de negociações 2026; atualização exibida **20/10/2026 às 10h30**. [Consulta de municípios e bases sindicais](https://sindratarsp.com.br/consulta-de-municipios/). Não inferir disponibilidade de PDF pela situação “Assinado”.

- [Rede/Itaú — e.Rede](https://developer.userede.com.br/e-rede), consultada em 07/11/2026: atualização **26/10/2026**, desativação e.Rede ao longo de **2027**, evolução Itaú Checkout. A página descreve cartões; não comprova PIX+boleto no contrato do cliente. **e.Rede antigo não foi adotado como padrão**.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage privado](https://supabase.com/docs/guides/storage/buckets/fundamentals), [backups](https://supabase.com/docs/guides/platform/backups).
- [Resend idempotência](https://resend.com/docs/dashboard/emails/idempotency-keys), [API de envio](https://resend.com/docs/api-reference/emails/send-email). Confirmar limites/TTL/documentação atuais no processo de ativação.
- [W3C WAI — formulários acessíveis](https://www.w3.org/WAI/tutorials/forms/): formulários curtos, labels persistentes, agrupamentos fieldset/legend, instruções, validação e progresso.
