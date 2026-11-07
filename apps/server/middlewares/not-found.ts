import type { NotFoundHandler } from "hono";
import { apiFailure } from "@repo/shared/http";

export const notFound: NotFoundHandler = (c) => {
  return c.json(apiFailure("NOT_FOUND", "Not found"), 404);
};
