import type { ErrorHandler } from "hono";
import { apiFailure } from "@repo/shared/http";

export const onError: ErrorHandler = (err, c) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  return c.json(apiFailure("INTERNAL_SERVER_ERROR", message), 500);
};
