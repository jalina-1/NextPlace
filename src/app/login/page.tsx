"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authPost } from "@/lib/client/session";
import { t } from "@/lib/i18n";

function LoginForm() {
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = sp.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authPost("sign-in/email", { email, password });
      location.href = safeNext;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }
  return (
    <AuthCard title={t("auth.login")} footer={<>New here? <Link className="font-medium text-teal-800 underline" href="/register">Create an account</Link></>}>
      {sp.get("reason") === "replaced" && (
        <div className="mb-4">
          <Alert tone="warning" title="Signed out">{t("auth.replaced")}</Alert>
        </div>
      )}
      {sp.get("reset") === "1" && (
        <div className="mb-4">
          <Alert tone="success">Your password was changed. Sign in with the new password.</Alert>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("auth.email")} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t("auth.password")} htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Signing in…" : t("auth.login")}
        </Button>
        <p className="text-center text-sm">
          <Link href="/forgot-password" className="text-teal-800 underline">
            {t("auth.forgot")}
          </Link>
        </p>
        <p className="text-xs text-navy-700">Signing in here signs you out on any other device or browser.</p>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
