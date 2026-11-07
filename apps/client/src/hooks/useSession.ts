import { authClient, clearAuthToken } from "@/lib/auth";

/**
 * Template-level session hook so agents no longer call authClient.useSession() everywhere.
 *
 * Contract:
 * - `user` is the current signed-in user, or null when signed out.
 * - `isPending` is used for loading UI.
 * - `isAuthenticated` is the single auth check used by AuthGate and business pages.
 * - `signOut()` signs out from Better Auth and clears the local Bearer token.
 */
export function useSession() {
  const session = authClient.useSession();

  const user = session.data?.user ?? null;
  const isPending = Boolean(session.isPending);
  const isAuthenticated = Boolean(user);

  async function signOut() {
    await authClient.signOut().catch(() => undefined);
    clearAuthToken();
    window.location.reload();
  }

  return {
    session: session.data ?? null,
    user,
    isPending,
    isAuthenticated,
    signOut
  };
}
