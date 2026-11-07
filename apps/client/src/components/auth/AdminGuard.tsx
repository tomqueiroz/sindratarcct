import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { RequireAuth } from "./route-guards";

type AdminGuardProps = {
  children: ReactNode;
  redirectTo?: string;
  forbiddenFallback?: ReactNode;
};

type RoleState = "checking" | "admin" | "user";

function AdminAccessLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function AdminAccessForbidden() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">403 Forbidden</h1>
        <p className="mt-2 text-sm text-muted-foreground">This account does not have admin access.</p>
      </div>
    </div>
  );
}

async function readApiData<T>(response: Response): Promise<T | null> {
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: T } | null;
  return payload?.ok && payload.data ? payload.data : null;
}

function RequireAdminRole({ children, forbiddenFallback }: Omit<AdminGuardProps, "redirectTo">) {
  const [role, setRole] = useState<RoleState>("checking");

  useEffect(() => {
    let active = true;
    setRole("checking");

    void apiFetch("/me/profile")
      .then((response) => readApiData<{ profile: { role: "admin" | "user" } }>(response))
      .then((data) => {
        if (!active) {
          return;
        }
        setRole(data?.profile.role === "admin" ? "admin" : "user");
      })
      .catch(() => {
        if (active) {
          setRole("user");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (role === "checking") {
    return <AdminAccessLoading />;
  }

  if (role !== "admin") {
    return <>{forbiddenFallback ?? <AdminAccessForbidden />}</>;
  }

  return <>{children}</>;
}

export function AdminGuard({ children, redirectTo = "/auth", forbiddenFallback }: AdminGuardProps) {
  return (
    <RequireAuth redirectTo={redirectTo}>
      <RequireAdminRole forbiddenFallback={forbiddenFallback}>{children}</RequireAdminRole>
    </RequireAuth>
  );
}

export const RequireAdmin = AdminGuard;
