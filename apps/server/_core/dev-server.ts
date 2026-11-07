import { serve } from "@hono/node-server";
import app from "./create-app";
import { env } from "./env";

serve(
  {
    fetch: app.fetch,
    hostname: "0.0.0.0",
    port: env.PORT
  },
  () => {
    console.log(`Server dev listening on http://localhost:${env.PORT}`);
  }
);
