import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { authClient } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { readResponseBody, normalizeApiError } from "@/lib/api-error";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layout, PageMeta } from "@/components/cct/Layout";

/**
 * Reference auth page — wired to the rules in AGENTS.md (### Auth). This is an
 * EXAMPLE to copy/adapt for your product; keep the navigation pattern intact.
 *
 * It demonstrates the four things generated login pages usually get wrong:
 *   1. Tri-state session gating — wait for the session check (loading) before
 *      deciding. Never treat "loading" as "guest", or the first paint after
 *      login bounces the authenticated user straight back here.
 *   2. Reverse guard — an already-authenticated user is redirected away from
 *      /auth instead of being shown the login form again.
 *   3. On success, navigate with the router. NEVER call
 *      window.location.reload(): this is a client-side-routed SPA, so a reload
 *      just re-renders THIS login route and strands the user ("logs in but
 *      bounces back to login"). The Bearer token is already persisted by
 *      lib/auth.ts.
 *   4. Session refresh after out-of-band verification — the verify-code
 *      endpoint is a product API route, not a Better Auth endpoint, so the
 *      client session atom does NOT update on its own. Await a session
 *      refetch before navigating away, or every auth guard keeps reading the
 *      pre-verification session (emailVerified: false) and the app looks
 *      logged out right after a successful verification.
 *
 * Protecting other routes is the mirror image: gate them on the same
 * loading / authed / guest tri-state and redirect guests to "/auth".
 */
const AuthPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const destination = params.get("returnTo") === "acompanhar" ? "/acompanhar" : "/";
  const { data: session, isPending, refetch: refetchSession } = authClient.useSession();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);

  const verificationEmail =
    pendingVerificationEmail || (!session?.user?.emailVerified ? session?.user?.email ?? "" : "");
  const resendWaitSeconds = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));

  useEffect(() => {
    if (resendAvailableAt <= now) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [now, resendAvailableAt]);

  // (1) Loading: the token-based session check has not resolved yet.
  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // (2) Reverse guard: verified users leave the login route. Keep signed-in
  // but unverified users here so the verification-code form cannot be skipped
  // by a fast session refresh after sign-up.
  if (session?.user?.emailVerified && !verificationEmail) {
    return <Navigate to={destination} replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({ name, email, password })
          : await authClient.signIn.email({ email, password });

      if (result.error) {
        throw new Error(result.error.message ?? "Não foi possível acessar a conta.");
      }

      if (mode === "signup") {
        await sendVerificationCode();
        setPendingVerificationEmail(email);
        toast.success("Código de verificação enviado.");
        return;
      }

      toast.success("Você entrou na sua conta.");
      // (3) Navigate via the router. Do NOT window.location.reload().
      await refetchSession();
      navigate(destination, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível acessar. Confira os dados.");
    } finally {
      setSubmitting(false);
    }
  };

  const sendVerificationCode = async () => {
    const response = await apiFetch("/email-verification/send-code", {
      method: "POST",
      auth: true
    });
    if (!response.ok) {
      const body = await readResponseBody(response);
      const retryAfterSeconds =
        body && typeof body === "object" && "data" in body
          ? Number((body.data as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds ?? 0)
          : 0;
      if (retryAfterSeconds > 0) {
        setNow(Date.now());
        setResendAvailableAt(Date.now() + retryAfterSeconds * 1000);
      }
      throw new Error(normalizeApiError(body).message);
    }
    setNow(Date.now());
    setResendAvailableAt(Date.now() + 60 * 1000);
  };

  const onVerifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await apiFetch("/email-verification/verify-code", {
        method: "POST",
        auth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verificationCode })
      });
      if (!response.ok) {
        throw new Error(normalizeApiError(await readResponseBody(response)).message);
      }

      // (4) Refresh the Better Auth session BEFORE leaving this screen; the
      // verify-code route updated the database out of band, so the client
      // session atom still says emailVerified: false until this refetch.
      await refetchSession();

      toast.success("E-mail verificado.");
      navigate(destination, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível verificar o código.");
    } finally {
      setSubmitting(false);
    }
  };

  const onResendCode = async () => {
    setSubmitting(true);
    try {
      await sendVerificationCode();
      toast.success("Código reenviado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reenviar o código.");
    } finally {
      setSubmitting(false);
    }
  };

  if (verificationEmail) {
    return (
      <Layout><PageMeta title="Verificar e-mail" description="Verificação de acesso à central de convenções SINDRATAR-SP." /><div className="wrap inner-page"><div className="auth-shell">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Confirme seu e-mail</CardTitle>
            <CardDescription>Informe o código de 6 dígitos enviado para {verificationEmail}. Verifique também o spam.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onVerifyCode} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="verification-code">Código de verificação</Label>
                <Input
                  id="verification-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting || verificationCode.length !== 6}>
                {submitting ? "Verificando..." : "Confirmar e-mail"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={submitting || resendWaitSeconds > 0}
                onClick={onResendCode}
              >
                {resendWaitSeconds > 0 ? `Reenviar em ${resendWaitSeconds}s` : "Reenviar código"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p>O envio de códigos usa a infraestrutura de homologação. Não é a configuração Resend de produção.</p><Link className="text-link" to="/">← Voltar à consulta</Link></div></div></Layout>
    );
  }

  return (
    <Layout><PageMeta title="Acessar minha conta" description="Cadastro e acesso privado para acompanhar pedidos de convenção coletiva." /><div className="wrap inner-page"><div className="auth-shell">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === "signup" ? "Crie sua conta" : "Bom ter você por aqui."}</CardTitle>
          <CardDescription>
            {mode === "signup" ? "Um cadastro curto para acompanhar sua solicitação." : "Entre para registrar ou acompanhar seu pedido. O rascunho da consulta permanece neste navegador."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as "signin" | "signup")}
            className="mb-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
          </Tabs>
          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Seu nome</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail profissional</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Aguarde…" : mode === "signup" ? "Criar minha conta" : "Entrar na minha conta"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p>Conta de homologação, separada do projeto Supabase de produção. Use apenas dados de teste. Esqueceu sua senha? A recuperação da operação definitiva será configurada no Supabase antes do lançamento.</p><Link className="text-link" to="/">← Voltar à consulta</Link></div></div></Layout>
  );
};

export default AuthPage;
