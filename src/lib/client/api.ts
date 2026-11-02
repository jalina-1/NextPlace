"use client";
/** Browser fetch helper. The server is the source of truth; nothing authoritative is kept in local storage. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body: Record<string, unknown>) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    if (typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
      const reason = body.error === "session_replaced" ? "replaced" : "signin";
      location.href = `/login?reason=${reason}&next=${encodeURIComponent(location.pathname + location.search)}`;
    }
    throw new ApiError(401, body.error ?? "unauthenticated", body.message ?? "Please sign in.", body);
  }
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("application/json") ? await res.json() : {};
  if (!res.ok) throw new ApiError(res.status, body.error ?? "error", body.message ?? `Request failed (${res.status})`, body);
  return body as T;
}

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong.";
}
