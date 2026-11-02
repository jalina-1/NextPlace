-- Supabase exposes the public schema through its Data API (anon/authenticated roles).
-- NextPlace only accesses these tables from the server as the table owner, so RLS is enabled
-- with NO policies: API roles get no access, the server (owner) is unaffected.
ALTER TABLE "public"."user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."session_revocation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."app_setting" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."project" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."preference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."source_file" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."import_mapping" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."option" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."institution" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."project_institution" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."analysis_run" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."job" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."score_run" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."option_score" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."final_order" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."final_order_revision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."ai_message" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."ai_proposal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."payment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."access_grant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."audit_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."usage_counter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."email_outbox" ENABLE ROW LEVEL SECURITY;
