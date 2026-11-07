import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthPage from "./Index";

const useSession = vi.fn();
const apiFetch = vi.fn();

vi.mock("@/lib/auth", () => ({
  authClient: {
    useSession: () => useSession(),
  },
}));

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderAuthPage() {
  return render(
    <MemoryRouter initialEntries={["/auth"]}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("auth page verification flow", () => {
  beforeEach(() => {
    useSession.mockReset();
    apiFetch.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  // The verify-code endpoint is a product route that updates the database out
  // of band, so Better Auth's client session atom does not refresh itself.
  // Navigating before the awaited refetch leaves every guard reading the
  // pre-verification session and the app looks logged out.
  it("refetches the session before navigating after code verification", async () => {
    let resolveRefetch: () => void = () => {};
    const refetch = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefetch = resolve;
        })
    );
    useSession.mockReturnValue({
      data: { user: { id: "user_1", email: "user@example.com", emailVerified: false } },
      isPending: false,
      refetch,
    });
    apiFetch.mockResolvedValue({ ok: true });

    renderAuthPage();

    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify email" }));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/email-verification/verify-code",
      expect.objectContaining({ method: "POST" })
    );
    // Still on the verification screen while the session refetch is pending.
    expect(screen.queryByText("Home Page")).toBeNull();

    resolveRefetch();
    await waitFor(() => expect(screen.getByText("Home Page")).not.toBeNull());
  });
});
