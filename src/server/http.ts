import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "./logger";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export const errors = {
  unauthorized: (code = "unauthenticated", msg = "Please sign in.") => new HttpError(401, code, msg),
  forbidden: (msg = "You do not have access to this resource.") => new HttpError(403, "forbidden", msg),
  notFound: (msg = "Not found.") => new HttpError(404, "not_found", msg),
  premium: (msg = "This requires premium access.") => new HttpError(402, "premium_required", msg),
  conflict: (msg: string, extra?: Record<string, unknown>) => new HttpError(409, "conflict", msg, extra),
  bad: (msg: string, extra?: Record<string, unknown>) => new HttpError(400, "bad_request", msg, extra),
  limit: (msg: string) => new HttpError(429, "rate_limited", msg),
};

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response | unknown>) {
  return async (...args: A): Promise<Response> => {
    try {
      const out = await fn(...args);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return NextResponse.json({ error: e.code, message: e.message, ...e.extra }, { status: e.status });
  if (e instanceof ZodError)
    return NextResponse.json({ error: "validation", message: "Invalid input.", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  logger.error("request.failed", { error: e instanceof Error ? e.message : String(e) });
  return NextResponse.json({ error: "internal", message: "Something went wrong. Please try again." }, { status: 500 });
}
