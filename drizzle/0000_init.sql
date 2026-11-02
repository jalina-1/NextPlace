CREATE TABLE "access_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"payment_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"months" integer NOT NULL,
	"created_by" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_grant_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_message" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"mode" text NOT NULL,
	"proposal_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"base_revision" integer NOT NULL,
	"base_preference_revision" integer NOT NULL,
	"action" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_run" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"status" text NOT NULL,
	"level" text NOT NULL,
	"option_count" integer NOT NULL,
	"evaluated_option_count" integer NOT NULL,
	"evaluated_option_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"total_tasks" integer DEFAULT 0 NOT NULL,
	"done_tasks" integer DEFAULT 0 NOT NULL,
	"failed_tasks" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"subject_key" text NOT NULL,
	"project_id" text,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"value" jsonb,
	"units" jsonb,
	"provider" text NOT NULL,
	"source_ref" text,
	"source_url" text,
	"attribution" text,
	"query_context" jsonb,
	"confidence" real,
	"is_demo" boolean DEFAULT false NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "final_order" (
	"project_id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"items" jsonb NOT NULL,
	"excluded" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'editing' NOT NULL,
	"finalized_revision_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "final_order_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"number" integer NOT NULL,
	"items" jsonb NOT NULL,
	"excluded" jsonb NOT NULL,
	"score_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_mapping" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_file_id" text NOT NULL,
	"table_key" text NOT NULL,
	"header_row_index" integer NOT NULL,
	"original_headers" jsonb NOT NULL,
	"mapping" jsonb NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institution" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"district" text,
	"status" text NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"project_id" text,
	"analysis_run_id" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_file_id" text NOT NULL,
	"seq" integer NOT NULL,
	"source_ref" text NOT NULL,
	"original" jsonb NOT NULL,
	"corrections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"original_index" text,
	"district" text,
	"institution" text,
	"designation" text,
	"vacancies" text,
	"extraction_confidence" real DEFAULT 1 NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duplicate_group" text,
	"decision" text DEFAULT 'consider' NOT NULL,
	"institution_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option_score" (
	"score_run_id" text NOT NULL,
	"option_id" text NOT NULL,
	"system_rank" integer,
	"final_score" real,
	"coverage" real NOT NULL,
	"status" text NOT NULL,
	"breakdown" jsonb NOT NULL,
	"explanation" text NOT NULL,
	CONSTRAINT "option_score_score_run_id_option_id_pk" PRIMARY KEY("score_run_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"method" text NOT NULL,
	"amount_lkr" integer NOT NULL,
	"reference" text,
	"paid_on" text,
	"receipt_key" text NOT NULL,
	"receipt_mime" text NOT NULL,
	"receipt_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_note" text,
	"admin_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preference" (
	"project_id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"preview_option_ids" jsonb,
	"preview_frozen_at" timestamp with time zone,
	"preview_basis" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_institution" (
	"project_id" text NOT NULL,
	"institution_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"chosen" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_institution_project_id_institution_key_pk" PRIMARY KEY("project_id","institution_key")
);
--> statement-breakpoint
CREATE TABLE "score_run" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"preference_revision" integer NOT NULL,
	"weights" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "session_revocation" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_file" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"kind" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"parse_status" text NOT NULL,
	"parse_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counter" (
	"key" text NOT NULL,
	"window" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counter_key_window_pk" PRIMARY KEY("key","window")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposal" ADD CONSTRAINT "ai_proposal_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_run" ADD CONSTRAINT "analysis_run_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_order" ADD CONSTRAINT "final_order_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_order_revision" ADD CONSTRAINT "final_order_revision_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_mapping" ADD CONSTRAINT "import_mapping_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_mapping" ADD CONSTRAINT "import_mapping_source_file_id_source_file_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."source_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option" ADD CONSTRAINT "option_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_score" ADD CONSTRAINT "option_score_score_run_id_score_run_id_fk" FOREIGN KEY ("score_run_id") REFERENCES "public"."score_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_score" ADD CONSTRAINT "option_score_option_id_option_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."option"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference" ADD CONSTRAINT "preference_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_institution" ADD CONSTRAINT "project_institution_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_run" ADD CONSTRAINT "score_run_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_file" ADD CONSTRAINT "source_file_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_grant_user_idx" ON "access_grant" USING btree ("user_id","ends_at");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_event" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_subject_kind_idx" ON "evidence" USING btree ("subject_key","kind");--> statement-breakpoint
CREATE INDEX "job_claim_idx" ON "job" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "job_run_idx" ON "job" USING btree ("analysis_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_dedupe_idx" ON "job" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "option_project_idx" ON "option" USING btree ("project_id","seq");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payment" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "project_user_idx" ON "project" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");