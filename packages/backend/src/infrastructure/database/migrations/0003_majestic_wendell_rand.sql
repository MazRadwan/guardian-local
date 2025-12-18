ALTER TABLE "files" ADD COLUMN "intake_context" jsonb;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "intake_gap_categories" text[];--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "intake_parsed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "files_conversation_id_idx" ON "files" USING btree ("conversation_id");