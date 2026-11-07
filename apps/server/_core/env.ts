const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const DEV_BETTER_AUTH_SECRET = "dev-only-better-auth-secret-change-before-production";
const FALLBACK_BETTER_AUTH_SECRET = "coding-agent-web-template-fallback-secret-change-in-production";

function readEnv(...values: Array<string | undefined>) {
  return values.find((value) => value !== undefined && value.trim() !== "");
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const cliPort = readCliPort(process.argv);
const betterAuthSecret =
  readEnv(process.env.BETTER_AUTH_SECRET) ?? (nodeEnv === "production" ? FALLBACK_BETTER_AUTH_SECRET : DEV_BETTER_AUTH_SECRET);
const allowedOrigins = readEnv(process.env.ALLOWED_ORIGINS) ?? "http://localhost:3100";

export const env = {
  NODE_ENV: nodeEnv,
  PORT: Number(cliPort ?? process.env.PORT ?? 9901),
  // Must match the platform health-check / routed container port (the deploy
  // pipeline registers 3000 and injects SKY_FC_SERVER_PORT; image-mode FC does not
  // set it by itself). A 9901-style mismatch gets the instance killed by the
  // 120s health check and every request answers 412 FunctionNotStarted.
  SKY_FC_SERVER_PORT: Number(readEnv(process.env.SKY_FC_SERVER_PORT, process.env.PORT) ?? 3000),
  ALLOWED_ORIGINS: allowedOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  BETTER_AUTH_URL: readEnv(process.env.BETTER_AUTH_URL) ?? "http://localhost:3100/api/auth",
  BETTER_AUTH_SECRET: betterAuthSecret,
  // The backend's own public base URL. The API domain is only assigned at
  // deploy time (different domain from the static client), so it is never a
  // build-time constant — the deploy pipeline injects it here once known.
  // Used by getPublicBaseUrl() (see _core/public-url.ts) to build absolute
  // callback / webhook URLs (e.g. payment providers). Empty until injected.
  PUBLIC_BACKEND_URL: readEnv(process.env.PUBLIC_BACKEND_URL) ?? "",
  SKYBASE_DB_ENDPOINT: readEnv(process.env.SKYBASE_DB_ENDPOINT) ?? "",
  SKYBASE_DB_TOKEN: readEnv(process.env.SKYBASE_DB_AUTH_TOKEN, process.env.SKYBASE_DB_TOKEN) ?? "",
  SKYBASE_DB_NAMESPACE: readEnv(process.env.SKYBASE_DB_NAMESPACE) ?? "",
  SKYWORK_GATEWAY_BASE_URL: readEnv(process.env.SKYWORK_GATEWAY_BASE_URL) ?? "https://api-inn.skywork.ai/gateway",
  SKYWORK_API_TOKEN: readEnv(process.env.SKYWORK_API_TOKEN) ?? "",
  SKYWORK_AI_BASE_URL: readEnv(process.env.SKYWORK_AI_BASE_URL) ?? "https://api.skywork.ai/skycowork-llm/",
  GOOGLE_CLIENT_ID:
    readEnv(process.env.GOOGLE_CLIENT_ID, process.env.VITE_GOOGLE_CLIENT_ID, viteEnv.VITE_GOOGLE_CLIENT_ID) ?? "",
  GOOGLE_CLIENT_SECRET: readEnv(process.env.GOOGLE_CLIENT_SECRET) ?? ""
};

function readCliPort(argv: string[]) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if ((arg === "-p" || arg === "--port") && argv[index + 1]) {
      return argv[index + 1];
    }

    if (arg.startsWith("--port=")) {
      return arg.slice("--port=".length);
    }
  }

  return undefined;
}
