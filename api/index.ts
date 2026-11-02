import {startupDiagnostic} from "../server/diagnostics.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
let application: Promise<any> | undefined;
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  // Do not silently create ephemeral databases or public/local receipt storage.
  const required = [
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  if (required.some((k) => !process.env[k])) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error:
          "Deployment setup incomplete. Configure database and private storage in Vercel Environment Variables.",
      }),
    );
    return;
  }
  process.env.NO_LISTEN = "1";
  process.env.NODE_ENV = "production";
  const url = new URL(req.url || "/", "https://deployment.invalid");
  const pathname = url.searchParams.get("__path");
  if (pathname !== null) {
    url.searchParams.delete("__path");
    req.url =
      "/api/" +
      pathname.replace(/^\/+/, "") +
      (url.search ? "?" + url.searchParams.toString() : "");
  }
  application ??= import("../server/index.ts")
    .then((m) => m.app)
    .catch((e) => {
      application = undefined;
      throw e;
    });
  try {
    const app = await application;
    app(req, res);
  } catch (error) {
    console.error(JSON.stringify(startupDiagnostic(error)));
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error:
          "Backend initialization failed. Check database configuration and deployment logs.",
      }),
    );
  }
}
