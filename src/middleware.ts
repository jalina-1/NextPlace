import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight page guard: redirects to sign-in when no session cookie is present.
 * Real authorization happens server-side on every API request (session validated in the database).
 */
export function middleware(req: NextRequest) {
  const has = req.cookies.get("better-auth.session_token") || req.cookies.get("__Secure-better-auth.session_token");
  if (!has) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/projects/:path*", "/payment/:path*", "/account/:path*", "/admin/:path*"] };
