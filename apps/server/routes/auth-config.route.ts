import { Hono } from "hono";
import { apiSuccess } from "@repo/shared/http";
import { enabledSocialProviders, enabledThirdPartySocialProviders } from "../_core/auth";

// Public: clients read enabled providers before authenticating.
export const isPublic = true;

export const authConfigRouter = new Hono();

authConfigRouter.get("/", (c) => {
  return c.json(
    apiSuccess({
      socialProviders: enabledSocialProviders,
      thirdPartySocialProviders: enabledThirdPartySocialProviders
    })
  );
});
