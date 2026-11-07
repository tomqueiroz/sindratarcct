import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { collectRoutePathsForMessaging } from "@/lib/react-router-dom-proxy";

afterEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("history routing", () => {
  it("collects normal path routes without the removed examples route", () => {
    const routePaths = collectRoutePathsForMessaging(
      <>
        <Route path="/" element={<div />} />
        <Route path="*" element={<div />} />
      </>
    );

    expect(routePaths).toContain("/");
    expect(routePaths).toContain("/*");
    expect(routePaths).not.toContain("/example");
    expect(routePaths).not.toContain("/examples");
  });

  it("keeps route paths in history format instead of hash-router format", () => {
    const routePaths = collectRoutePathsForMessaging(
      <>
        <Route path="/" element={<div />} />
        <Route path="/dashboard" element={<div />} />
      </>
    );

    expect(routePaths).toContain("/dashboard");
    expect(routePaths.every((path) => !path.includes("/#/"))).toBe(true);
  });

  it("emits route messages through the BrowserRouter bridge", async () => {
    vi.resetModules();
    window.history.replaceState({}, "", "/");

    const postedMessages: unknown[] = [];
    Object.defineProperty(window, "top", {
      configurable: true,
      value: {
        postMessage: vi.fn((message: unknown) => {
          postedMessages.push(message);
        })
      }
    });

    const { default: App } = await import("../App");
    render(<App />);

    await waitFor(() => {
      expect(postedMessages.some((message) => (message as { type?: string }).type === "ROUTES_INFO")).toBe(true);
      expect(postedMessages.some((message) => (message as { type?: string }).type === "ROUTE_CHANGE")).toBe(true);
    });

    const routesInfo = postedMessages.find((message) => (message as { type?: string }).type === "ROUTES_INFO") as {
      routes: Array<{ path: string }>;
    };
    const routeChange = postedMessages.find((message) => (message as { type?: string }).type === "ROUTE_CHANGE") as {
      fullPath: string;
      path: string;
    };

    expect(routesInfo.routes.map((route) => route.path)).not.toContain("/examples");
    expect(routeChange.path).toBe("/");
    expect(routeChange.fullPath).toBe("/");
    expect(routeChange.fullPath).not.toContain("/#/");
  }, 10_000);

  it("scrolls to the top when the pathname changes", async () => {
    window.history.replaceState({}, "", "/");
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const view = render(
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Link to="/details">View details</Link>} />
          <Route path="/details" element={<div>Details</div>} />
        </Routes>
      </BrowserRouter>
    );

    await waitFor(() => expect(scrollTo).toHaveBeenCalled());
    scrollTo.mockClear();

    fireEvent.click(view.getByRole("link", { name: "View details" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/details");
      expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
    });
  });
});
