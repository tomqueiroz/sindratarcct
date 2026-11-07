// T2 (frontend smoke) — skeleton.
//
// Intended behavior (TODO, next-round PR): import App and assert that
// `render(<App />)` does not throw and produces SOME content in the
// container. That catches dead imports, missing exports, runtime errors
// in module top-level code, and SSR-unsafe globals touched during the
// first paint.
//
//   import { render } from "@testing-library/react";
//   import App from "../App";
//
//   it("renders without throwing", () => {
//     const { container } = render(<App />);
//     expect(container.firstChild).not.toBeNull();
//   });
//
// For this PR the body is intentionally a placeholder — the gate doesn't
// depend on it (T2 is "可选" per the design doc's mode × type matrix), and
// implementing it cleanly needs @testing-library/react to be wired (B14)
// plus a decision about which provider boundary App needs (Router, Query,
// Theme). Punted to the next round.

import { describe, expect, it } from "vitest";

describe("app smoke (skeleton)", () => {
  it("placeholder — replace with `render(<App />)` assertion", () => {
    expect(true).toBe(true);
  });
});
