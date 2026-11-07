import { GoogleLoginButton } from "./GoogleLoginButton.tsx";
import { useSession } from "../../hooks/useSession.ts";

type AuthGateProps = {
  children: React.ReactNode;
  title?: string;
  description?: string;
  fallback?: React.ReactNode;
};

/**
 * Built-in template auth gate. Business pages only need to wrap content with AuthGate.
 *
 * Recommended agent usage:
 * ```tsx
 * <AuthGate>
 *   <ShoppingListApp />
 * </AuthGate>
 * ```
 */
export function AuthGate({
  children,
  title = "Sign in to continue",
  description = "Use your Google account to sync and protect your data.",
  fallback
}: AuthGateProps) {
  const { isPending, isAuthenticated } = useSession();

  if (isPending) {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <div className="text-sm text-muted-foreground">Checking your sign-in status...</div>
      </main>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <main className="min-h-screen grid place-items-center bg-muted/30 p-6">
      <section className="w-full max-w-md rounded-2xl border bg-background p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{description}</p>
        <GoogleLoginButton className="mt-6 w-full" />
      </section>
    </main>
  );
}
