CREATE TABLE "user_note" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"author_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_grant" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "access_grant" ADD COLUMN "revoked_by" text;--> statement-breakpoint
ALTER TABLE "access_grant" ADD COLUMN "revoke_reason" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "user_note" ADD CONSTRAINT "user_note_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_note_user_idx" ON "user_note" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "public"."user_note" ENABLE ROW LEVEL SECURITY;
