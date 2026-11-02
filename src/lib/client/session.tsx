"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export type Me =
  | { session: "anonymous" | "replaced" }
  | {
      session: "active";
      user: { id: string; email: string; name: string; role: "user" | "admin" };
      access: { premium: boolean; activeUntil: string | null; pendingPayment: boolean; lastRejected: { at: string | null; note: string | null } | null; expiredAt: string | null };
    };

const Ctx = createContext<{ me: Me | null; refresh: () => Promise<void> }>({ me: null, refresh: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
    } catch {
      setMe({ session: "anonymous" });
    }
  }, []);
  useEffect(() => {
    refresh();
    // Re-validate when the tab regains focus, so a session replaced elsewhere is noticed promptly.
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  return <Ctx.Provider value={{ me, refresh }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

export async function authPost(path: string, body: unknown) {
  const res = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Request failed");
  return data;
}
