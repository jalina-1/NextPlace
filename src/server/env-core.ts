/**
 * Server environment. Never import this from client components.
 * Values fall back to safe local-development defaults.
 */
function pick(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim() !== "") return v.trim();
  }
  return undefined;
}

export const env = {
  get databaseUrl() {
    return (
      pick("DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL") ??
      "postgresql://np:np@localhost:5432/nextplace"
    );
  },
  get appUrl() {
    const explicit = pick("APP_URL", "BETTER_AUTH_URL");
    if (explicit) return explicit.replace(/\/$/, "");
    const vercel = process.env.VERCEL_ENV === "production" ? pick("VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL") : pick("VERCEL_BRANCH_URL", "VERCEL_URL");
    if (vercel) return `https://${vercel}`;
    return "http://localhost:3000";
  },
  get authSecret() {
    const s = pick("BETTER_AUTH_SECRET", "AUTH_SECRET");
    if (s) return s;
    // During `next build` modules are evaluated to collect page data; no requests are served.
    if (process.env.NEXT_PHASE === "phase-production-build") return "build-time-placeholder-secret-not-used-for-requests";
    if (process.env.NODE_ENV === "production" && !process.env.NEXTPLACE_ALLOW_DEV_SECRET) {
      // Fall back to the Supabase JWT secret only if present, never a constant in production.
      const jwt = pick("SUPABASE_JWT_SECRET");
      if (jwt) return jwt;
      throw new Error("BETTER_AUTH_SECRET must be set in production");
    }
    return "dev-only-secret-change-me-dev-only-secret-change-me";
  },
  get storageDriver(): "local" | "supabase" {
    const d = pick("STORAGE_DRIVER");
    if (d === "local" || d === "supabase") return d;
    return pick("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL") && pick("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY")
      ? "supabase"
      : "local";
  },
  get localStorageDir() {
    return pick("LOCAL_STORAGE_DIR") ?? ".data/storage";
  },
  get supabaseUrl() {
    return pick("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseServiceKey() {
    return pick("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
  },
  get supabaseBucket() {
    return pick("SUPABASE_STORAGE_BUCKET") ?? "nextplace-private";
  },
  get providers() {
    return {
      maps: (pick("MAPS_PROVIDER") ?? (pick("GOOGLE_MAPS_API_KEY") ? "google" : "demo")) as "google" | "osm" | "demo",
      climate: (pick("CLIMATE_PROVIDER") ?? "demo") as "open-meteo" | "demo",
      facilities: (pick("FACILITIES_PROVIDER") ?? (pick("GOOGLE_MAPS_API_KEY") ? "google" : "demo")) as
        | "google"
        | "overpass"
        | "demo",
      // The research bot is not connected by default; the chat panel shows "coming soon".
      ai: (pick("AI_PROVIDER") ?? (pick("OPENAI_API_KEY") ? "openai" : pick("GEMINI_API_KEY") ? "gemini" : pick("ANTHROPIC_API_KEY") ? "anthropic" : "off")) as "openai" | "gemini" | "anthropic" | "demo" | "off",
      ocr: (pick("OCR_PROVIDER") ?? (pick("GOOGLE_VISION_API_KEY") ? "google-vision" : pick("OCR_SPACE_API_KEY") ? "ocr-space" : "off")) as
        | "google-vision"
        | "ocr-space"
        | "off",
      email: (pick("EMAIL_PROVIDER") ?? (pick("RESEND_API_KEY") ? "resend" : "outbox")) as "resend" | "outbox",
    };
  },
  get googleMapsKey() {
    return pick("GOOGLE_MAPS_API_KEY");
  },
  get anthropicKey() {
    return pick("ANTHROPIC_API_KEY");
  },
  get openaiKey() {
    return pick("OPENAI_API_KEY");
  },
  get openaiModel() {
    return pick("OPENAI_MODEL") ?? "gpt-5-mini";
  },
  get geminiKey() {
    return pick("GEMINI_API_KEY");
  },
  get geminiModel() {
    return pick("GEMINI_MODEL") ?? "gemini-2.5-flash";
  },
  get anthropicModel() {
    return pick("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
  },
  get googleVisionKey() {
    return pick("GOOGLE_VISION_API_KEY");
  },
  get ocrSpaceKey() {
    return pick("OCR_SPACE_API_KEY");
  },
  get resendKey() {
    return pick("RESEND_API_KEY");
  },
  get emailFrom() {
    return pick("EMAIL_FROM") ?? "NextPlace <no-reply@example.invalid>";
  },
  get osmContactEmail() {
    return pick("OSM_CONTACT_EMAIL");
  },
  get cronSecret() {
    return pick("CRON_SECRET");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};

/** Provider status for the admin page. Reports configuration only — never secret values. */
export function providerStatus() {
  const p = env.providers;
  return [
    { capability: "Database", provider: env.databaseUrl.includes("supabase") ? "Supabase Postgres" : "PostgreSQL", configured: true },
    { capability: "Private file storage", provider: env.storageDriver === "supabase" ? `Supabase Storage (bucket ${env.supabaseBucket})` : "Local filesystem (development)", configured: true },
    { capability: "Geocoding & routes", provider: p.maps, configured: p.maps !== "demo", demo: p.maps === "demo" },
    { capability: "Nearby facilities", provider: p.facilities, configured: p.facilities !== "demo", demo: p.facilities === "demo" },
    { capability: "Climate", provider: p.climate, configured: p.climate !== "demo", demo: p.climate === "demo" },
    { capability: "AI assistant", provider: p.ai, configured: (p.ai === "anthropic" && !!env.anthropicKey) || (p.ai === "openai" && !!env.openaiKey) || (p.ai === "gemini" && !!env.geminiKey), demo: p.ai === "demo" },
    { capability: "OCR for scanned PDFs", provider: p.ocr, configured: p.ocr !== "off" },
    { capability: "Email (password reset)", provider: p.email, configured: p.email === "resend" && !!env.resendKey },
    { capability: "Scheduled worker secret", provider: "CRON_SECRET", configured: !!env.cronSecret },
  ];
}
