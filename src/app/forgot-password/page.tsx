"use client";
import { useState } from "react";
import { AuthCard } from "@/components/AuthCard";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authPost } from "@/lib/client/session";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await authPost("request-password-reset", { email, redirectTo: `${location.origin}/reset-password` });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the link");
    }
  }
  return (
    <AuthCard title="Reset your password">
      {sent ? (
        <Alert tone="success" title="Check your email">
          If an account exists for {email}, a reset link valid for 30 minutes has been sent.
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
