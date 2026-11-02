/**
 * English UI strings. Sinhala (si) and Tamil (ta) dictionaries use the same keys;
 * missing keys fall back to English. Keep sentences whole (no string concatenation)
 * so translators can reorder words.
 */
export const en = {
  "app.name": "NextPlace",
  "app.tagline": "Organize and rank your transfer preferences with clear, explainable evidence.",
  "nav.dashboard": "Dashboard",
  "nav.account": "Account",
  "nav.admin": "Admin",
  "nav.signIn": "Sign in",
  "nav.signOut": "Sign out",
  "nav.getStarted": "Get started",
  "nav.payment": "Full access",
  "landing.hero.title": "Make sense of hundreds of transfer options",
  "landing.hero.body": "Upload the vacancy list you received, tell NextPlace what matters to you, and get a ranked, explainable shortlist — with travel, climate and nearby-facility evidence and clear labels wherever data is missing.",
  "landing.cta.primary": "Create a free account",
  "landing.cta.secondary": "I already have an account",
  "landing.steps.title": "How it works",
  "landing.free.title": "Start free",
  "landing.free.body": "Enter your preferences, upload your list and see your top three options for free. Full access (the whole ranked list, comparison, editing and Excel export) can be unlocked afterwards.",
  "landing.disclaimer": "NextPlace does not submit transfer applications, determine eligibility, predict official allocations, or guarantee that a transfer will be awarded.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.name": "Name (as you would like to be addressed)",
  "auth.register": "Create account",
  "auth.login": "Sign in",
  "auth.forgot": "Forgot password?",
  "auth.reset.request": "Send reset link",
  "auth.reset.set": "Set new password",
  "auth.replaced": "You were signed out because your account signed in on another device or browser. Only one active session is allowed per account.",
  "auth.passwordHint": "At least 10 characters.",
  "common.save": "Save",
  "common.saving": "Saving…",
  "common.saved": "Saved",
  "common.cancel": "Cancel",
  "common.continue": "Continue",
  "common.back": "Back",
  "common.loading": "Loading…",
  "common.unknown": "Unknown",
  "common.demo": "DEMO data",
  "common.premium": "Premium",
  "common.retry": "Try again",
  "premium.hidden": "{count} additional options — unlock full access",
  "premium.unlock": "Unlock full access",
} as const;

export type MessageKey = keyof typeof en;
