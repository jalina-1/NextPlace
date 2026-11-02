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
  if (e instanceof ZodError) {
    const issues = e.issues.map((i) => ({ path: i.path.join("."), message: friendlyIssue(i) }));
    return NextResponse.json({ error: "validation", message: issues.length === 1 ? issues[0].message : "Please check the highlighted fields.", issues }, { status: 400 });
  }
  logger.error("request.failed", { error: e instanceof Error ? e.message : String(e) });
  return NextResponse.json({ error: "internal", message: "Something went wrong. Please try again." }, { status: 500 });
}

/** Turns Zod's technical messages into short, plain sentences shown next to the field. */
function friendlyIssue(i: ZodError["issues"][number]): string {
  const x = i as unknown as { code: string; minimum?: number | bigint; maximum?: number | bigint; origin?: string; input?: unknown };
  const isText = x.origin === "string";
  if (x.code === "too_small") return isText ? (Number(x.minimum) <= 1 ? "Please fill this in." : `Use at least ${x.minimum} characters.`) : `Enter ${x.minimum} or more.`;
  if (x.code === "too_big") return isText ? `Use at most ${x.maximum} characters.` : `Enter ${x.maximum} or less.`;
  if (x.code === "invalid_type") return x.input === undefined || x.input === null ? "Please fill this in." : "This value isn’t valid.";
  if (x.code === "invalid_value" || x.code === "invalid_enum_value") return "Please choose one of the options.";
  return "This value isn’t valid.";
}
