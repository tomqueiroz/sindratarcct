import { handle } from "hono-alibaba-cloud-fc3-adapter";
import app from "./create-app";

// FC3 event adapter mode buffers responses and is intended for JSON/CRUD APIs.
// Streaming, SSE, WebSocket, or large response apps must switch this entry to the Web function shape.
export const handler = handle(app);

export default app;
