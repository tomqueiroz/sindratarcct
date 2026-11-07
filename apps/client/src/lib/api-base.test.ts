import { describe, expect, it, vi } from "vitest";

async function loadApiBase() {
  vi.resetModules();
  vi.stubGlobal("window", {
    location: {
      origin: "http://localhost:3100"
    }
  });

  return import("./api-base");
}

describe("api-base", () => {
  it("normalizes apiUrl paths with an /api prefix", async () => {
    const { apiUrl } = await loadApiBase();

    expect(apiUrl("/api/todos")).toBe("http://localhost:3100/api/todos");
    expect(apiUrl("/counter/stats")).toBe("http://localhost:3100/api/counter/stats");
    expect(apiUrl("counter/stats")).toBe("http://localhost:3100/api/counter/stats");
    expect(apiUrl("api/counter/stats")).toBe("http://localhost:3100/api/counter/stats");
    expect(apiUrl("/api/auth-config")).toBe("http://localhost:3100/api/auth-config");
    expect(apiUrl("/api")).toBe("http://localhost:3100/api");
  });

  it("keeps authUrl mounted under /api/auth", async () => {
    const { authUrl } = await loadApiBase();

    expect(authUrl()).toBe("http://localhost:3100/api/auth");
    expect(authUrl("/sign-in/social")).toBe("http://localhost:3100/api/auth/sign-in/social");
  });
});
