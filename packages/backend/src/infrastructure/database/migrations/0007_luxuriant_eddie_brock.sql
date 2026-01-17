ALTER TABLE "assessment_results" ADD COLUMN "narrative_status" varchar(20);--> statement-breakpoint
ALTER TABLE "assessment_results" ADD COLUMN "narrative_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD COLUMN "narrative_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD COLUMN "narrative_error" text;--> statement-breakpoint
CREATE INDEX "assessment_results_narrative_status_idx" ON "assessment_results" USING btree ("narrative_status");