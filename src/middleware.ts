import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight page guard: redirects to sign-in when no session cookie is present.
 * Real authorization happens server-side on every API request (session validated in the database).
 *
 * The admin console lives at a private address (ADMIN_PATH). The plain /admin address answers
 * "not found", and so does the private address for anyone who is not signed in, so the console
 * cannot be discovered by guessing. Being an administrator is still checked on every admin request.
 */
const PROTECTED = ["/dashboard", "/projects", "/payment", "/account"];
const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

export function adminPath(): string {
  const p = (process.env.ADMIN_PATH ?? "").trim().replace(/^\/+|\/+$/g, "");
  return /^[A-Za-z0-9_-]{3,80}$/.test(p) ? `/${p}` : "/admin";
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const has = req.cookies.get("better-auth.session_token") || req.cookies.get("__Secure-better-auth.session_token");
  const secret = adminPath();
  const notFound = () => {
    const url = req.nextUrl.clone();
    url.pathname = "/_hidden-not-found";
    return NextResponse.rewrite(url, { status: 404 });
  };

  if (under(path, secret)) {
    if (!has) return secret === "/admin" ? toLogin(req) : notFound();
    if (secret === "/admin") return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = `/admin${path.slice(secret.length)}`;
    return NextResponse.rewrite(url);
  }
  if (under(path, "/admin")) return notFound();
  if (PROTECTED.some((b) => under(path, b)) && !has) return toLogin(req);
  return NextResponse.next();
}

function toLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!api/|_next/|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"] };
