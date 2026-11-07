import { afterEach, describe, expect, it, vi } from "vitest";

// Re-import per test so _core/env.ts re-reads process.env (PUBLIC_BACKEND_URL).
async function loadHelper() {
  vi.resetModules();
  return import("../_core/public-url");
}

afterEach(() => {
  delete process.env.PUBLIC_BACKEND_URL;
});

describe("getPublicBaseUrl", () => {
  it("returns the deploy-injected PUBLIC_BACKEND_URL with the trailing slash trimmed", async () => {
    process.env.PUBLIC_BACKEND_URL = "https://abc-test.skywork.me/";
    const { getPublicBaseUrl } = await loadHelper();

    expect(getPublicBaseUrl()).toBe("https://abc-test.skywork.me");
  });

  it("returns an empty string when PUBLIC_BACKEND_URL is not set", async () => {
    const { getPublicBaseUrl } = await loadHelper();

    expect(getPublicBaseUrl()).toBe("");
  });
});
