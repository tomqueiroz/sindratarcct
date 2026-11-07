# SINDRATAR-SP — Solicitação de Convenção Coletiva

Página de serviço em pt-BR com identidade institucional e solicitação em três passos: atividade e município → dados do solicitante/empresa → pagamento. Não exige conta do solicitante.

Repositório: https://github.com/tomqueiroz/sindratarcct

## Estado da entrega

- Frontend React e backend Hono de homologação, com registro persistente de solicitações de teste.
- Página HTML nativa e shortcode WordPress em `integration/wordpress`.
- Código-fonte de integração Supabase, acesso privado aos documentos e e-mails em `integration/supabase`.
- Pagamento real, Resend, catálogo jurídico e PDFs oficiais **não estão ativados**. A configuração dos provedores precisa ser homologada antes de produção.
- A atualização editorial das negociações de 2026 reproduz a data informada na fonte oficial: **20/10/2026 às 10h30**. Não é uma sincronização em tempo real.
- A implantação gerenciada continua no Skywork. Este repositório armazena o código; não habilita GitHub Pages, banco, e-mails ou deploy automático.

## Arquivos principais

- `apps/client/src/pages/home/Index.tsx`: fluxo público sem conta.
- `apps/client/src/components/cct`: layout, dicas e quadro de negociações.
- `apps/server/services/cct-guest.ts`: pedidos pontuais, validação e idempotência.
- `integration/wordpress/pagina-cct-servico.html`: HTML para integração.
- `integration/README-tecnico.md`: instruções, requisitos de ativação e lacunas.

## Segurança do repositório

Não versionar `.env`, credenciais, tokens, certificados, bases de dados, logs ou documentos privados. Chaves de serviço e credenciais bancárias são exclusivamente server-side. Os exemplos de CNAEs são demonstrativos e não autorizam enquadramento jurídico.

O espelho GitHub contém o código-fonte e assets oficiais, sem diretórios de runtime ou builds gerados. A identidade e os comandos de implantação do projeto Skywork são controlados pela plataforma, não pelo remote GitHub.

---

## Referência técnica do scaffold

Full-stack template for generated web apps.

## What Is Included

- React client in `apps/client`
- Hono backend in `apps/server`
- Better Auth for user authentication
- Server-only skybase-db access through Drizzle ORM over libsql
- Shared response helpers in `packages/shared`

## Local Development

Install dependencies:

```bash
pnpm install
```

Start the local app:

```bash
cd apps/client
pnpm dev
```

Open:

```txt
http://localhost:3100/
```

The Vite dev server mounts the Hono backend under `/api/*` on the same origin.

The Vite dev server serves history routes from the same client app. For example:

```txt
http://localhost:3100/
```

## Runtime Env

Frontend env is public and must use `VITE_`.

Backend DB env is injected into the running function by skybase-controller for the current `session_id`. Local `.env` values are only for development/debugging.

Backend runtime env contract:

| Env | Required | Source | Purpose |
| --- | --- | --- | --- |
| `SKYBASE_DB_ENDPOINT` | Yes for DB-backed APIs | skybase-controller | sqld/libsql user API endpoint for this session, for example `http://10.59.118.218:8080` |
| `SKYBASE_DB_TOKEN` / `SKYBASE_DB_AUTH_TOKEN` | Yes for DB-backed APIs | skybase-controller | libsql rw token used as `Authorization: Bearer <token>`; `SKYBASE_DB_AUTH_TOKEN` is accepted as a controller-compatible alias |
| `SKYBASE_DB_NAMESPACE` | Yes for DB-backed APIs | skybase-controller | tenant namespace sent as `x-namespace` on libsql requests |
| `BETTER_AUTH_SECRET` | Recommended for production | controller/deploy config, local `.env` in dev | Better Auth signing secret |
| `BETTER_AUTH_URL` | Yes | controller/deploy config, local `.env` in dev | Public auth base URL, for example `http://localhost:3100/api/auth` |
| `ALLOWED_ORIGINS` | Yes | controller/deploy config, local `.env` in dev | Comma-separated CORS origins |
| `GOOGLE_CLIENT_ID` | Optional | OAuth provider config | Enables Google login when paired with `GOOGLE_CLIENT_SECRET` |
| `GOOGLE_CLIENT_SECRET` | Optional | OAuth provider config | Enables Google login when paired with `GOOGLE_CLIENT_ID` |

`SKYBASE_DB_TOKEN` / `SKYBASE_DB_AUTH_TOKEN` is not a Better Auth session token, user token, or skybase-controller `X-Auth-Token`. It is the libsql database token injected into this backend runtime. The app does not create this token and does not use DB admin email/password at runtime. Template code normalizes both names to `env.SKYBASE_DB_TOKEN`; when both names are present, `SKYBASE_DB_AUTH_TOKEN` wins.

Local development can use a root `.env` file:

```env
SKYBASE_DB_ENDPOINT=http://127.0.0.1:8080
SKYBASE_DB_AUTH_TOKEN=...
# SKYBASE_DB_TOKEN=... also works as a legacy alias
SKYBASE_DB_NAMESPACE=local
BETTER_AUTH_SECRET=replace-with-a-local-secret
BETTER_AUTH_URL=http://localhost:3100/api/auth
ALLOWED_ORIGINS=http://localhost:3100
```

If Vite starts on a fallback port such as `3101`, update `BETTER_AUTH_URL` and `ALLOWED_ORIGINS` to that port for local testing.

Production startup does not fail when `BETTER_AUTH_SECRET` is missing; the app falls back to a template default so demos can boot. Set a stable random `BETTER_AUTH_SECRET` before using real user auth. Missing `SKYBASE_DB_ENDPOINT`, DB token, or `SKYBASE_DB_NAMESPACE` does not block `/api/health`, but DB-backed APIs and `/api/auth/*` return `DATABASE_UNCONFIGURED`.

## Authentication

Authentication is handled by Better Auth at:

```txt
/api/auth/*
```

Supported auth flows:

- username + password
- email + password
- Google login when Google env is provided
- bearer token transport for API calls

Better Auth data is stored in skybase-db through its Drizzle adapter. Required auth tables are defined in the Drizzle schema and applied by agent database tooling, not by this app at runtime.

## Database Model

The app exposes business APIs to browsers. It does not expose raw database APIs.

Template routes:

```txt
GET /api/health
GET /api/auth-config
/api/auth/*
GET /api/todos
POST /api/todos
PATCH /api/todos/:id
DELETE /api/todos/:id
```

The app runtime does not create db instances, create tables, run migrations, or seed data. Controller owns DB provisioning/deploy env injection. Agent tooling owns Drizzle schema setup/migrations through the self-host `setup_database` step. FC runtime only performs business CRUD. The template intentionally does not expose DB setup or migration package scripts; those commands belong to controller/agent tooling so namespace-aware sqld execution stays outside the generated app runtime.

## API Client

Use the shared frontend API wrapper:

```ts
import { apiFetch } from "@/lib/api";
```

`apiFetch()` attaches the current Better Auth bearer token by default and shows a toast for non-2xx API responses.

## Build

Build frontend:

```bash
cd apps/client
pnpm build
```

Build backend for the default FC event adapter entry:

```bash
cd apps/server
pnpm build
```

Build backend for the long-running web entry used by the Docker image:

```bash
cd apps/server
SERVER_BUILD_TARGET=web pnpm build
```

Backend build output:

```txt
apps/server/dist/index.js
```

## Docker

Build the backend web entry first, then build the image:

```bash
cd apps/server
SERVER_BUILD_TARGET=web pnpm build
cd ../..
docker build -t coding-agent-web-template-api .
```

The Docker image copies and runs the existing backend build output:

```txt
apps/server/dist/index.js
```

The runtime image has a root `package.json` start script and supports platforms that run:

```bash
npm start
```

For local container debugging, provide backend runtime env through local container tooling without committing secrets.

## Checks

```bash
pnpm --filter server exec tsc -p tsconfig.json --noEmit
pnpm --filter server build
pnpm --filter client exec tsc -p tsconfig.app.json --noEmit
pnpm --filter client build
```
