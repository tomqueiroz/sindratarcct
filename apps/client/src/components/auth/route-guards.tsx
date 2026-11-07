import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { authClient } from "@/lib/auth";

type AuthRouteGuardProps = {
  children: ReactNode;
  requireVerifiedEmail?: boolean;
  redirectTo?: string;
};

function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

export function RequireAuth({
  children,
  requireVerifiedEmail = false,
  redirectTo = "/auth",
}: AuthRouteGuardProps) {
  const location = useLocation();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <AuthLoading />;
  }

  if (!session?.user) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  if (requireVerifiedEmail && !session.user.emailVerified) {
    return <Navigate to={redirectTo} replace state={{ from: location, reason: "verify_email" }} />;
  }

  return <>{children}</>;
}

export function RequireVerifiedEmail({ children, redirectTo = "/auth" }: AuthRouteGuardProps) {
  return (
    <RequireAuth requireVerifiedEmail redirectTo={redirectTo}>
      {children}
    </RequireAuth>
  );
}
