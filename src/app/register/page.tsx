"use client";
import Link from "next/link";
import { useState } from "react";
import { AuthCard } from "@/components/AuthCard";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authPost } from "@/lib/client/session";
import { t } from "@/lib/i18n";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters for your password.");
    setBusy(true);
    setError(null);
    try {
      await authPost("sign-up/email", { name, email, password });
      location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setBusy(false);
    }
  }
  return (
    <AuthCard title="Create your account" footer={<>Already registered? <Link className="font-medium text-teal-800 underline" href="/login">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("auth.name")} htmlFor="name">
          <Input id="name" autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("auth.email")} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t("auth.password")} hint={t("auth.passwordHint")} htmlFor="password">
          <Input id="password" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2 text-sm text-navy-800">
          <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
          <span>
            I understand NextPlace organizes my own preferences only. It does not submit applications, determine eligibility or predict official allocations. I have read the <Link href="/privacy" className="underline">privacy notice</Link>.
          </span>
        </label>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" disabled={busy || !agree} className="w-full">
          {busy ? "Creating account…" : t("auth.register")}
        </Button>
      </form>
    </AuthCard>
  );
}
