"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authPost } from "@/lib/client/session";

function ResetForm() {
  const sp = useSearchParams();
  const token = sp.get("token");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(sp.get("error") ? "This reset link is invalid or has expired. Request a new one." : null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await authPost("reset-password", { newPassword: pw, token });
      location.href = "/login?reset=1";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    }
  }
  return (
    <AuthCard title="Choose a new password">
      {!token ? (
        <Alert tone="error">This reset link is missing its token. Request a new link.</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="New password" hint="At least 10 characters. All your sessions will be signed out." htmlFor="pw">
            <Input id="pw" type="password" autoComplete="new-password" minLength={10} required value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full">
            Set new password
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
