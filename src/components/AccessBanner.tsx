"use client";
import Link from "next/link";
import { useSession } from "@/lib/client/session";
import { formatColombo } from "@/lib/dates";
import { Alert } from "./ui";

export function AccessBanner() {
  const { me } = useSession();
  if (me?.session !== "active") return null;
  const a = me.access;
  if (a.premium) return <Alert tone="success">Full access active until {formatColombo(a.activeUntil)} (Asia/Colombo). Access does not renew automatically.</Alert>;
  if (a.pendingPayment) return <Alert tone="info" title="Payment under review">We received your receipt. Access starts when an administrator approves it.</Alert>;
  if (a.lastRejected)
    return (
      <Alert tone="warning" title="Payment not approved">
        {a.lastRejected.note ?? "Your last receipt was not approved."} <Link className="underline" href="/payment">Review payment</Link>
      </Alert>
    );
  if (a.expiredAt) return <Alert tone="warning" title="Full access expired">Your access ended on {formatColombo(a.expiredAt)}. Your projects and final lists are kept. <Link className="underline" href="/payment">Renew</Link></Alert>;
  return null;
}
