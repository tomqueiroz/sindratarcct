import { serve } from "@hono/node-server";
import app from "./create-app";
import { env } from "./env";

// FC3 Web function mode for streaming/SSE/large-response apps.
// The HTTP server must listen on 0.0.0.0:$SKY_FC_SERVER_PORT.
serve({
  fetch: app.fetch,
  hostname: "0.0.0.0",
  port: env.SKY_FC_SERVER_PORT
});
