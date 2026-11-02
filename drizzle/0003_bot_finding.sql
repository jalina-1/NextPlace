CREATE TABLE "bot_finding" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"option_id" text,
	"topic" text NOT NULL,
	"summary" text NOT NULL,
	"source_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_finding" ADD CONSTRAINT "bot_finding_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_finding" ADD CONSTRAINT "bot_finding_option_id_option_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."option"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_finding_project_idx" ON "bot_finding" USING btree ("project_id","option_id");--> statement-breakpoint
ALTER TABLE "public"."bot_finding" ENABLE ROW LEVEL SECURITY;
