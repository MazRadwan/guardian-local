CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"file_id" uuid,
	"section_number" integer NOT NULL,
	"question_number" integer NOT NULL,
	"question_text" text NOT NULL,
	"response_text" text NOT NULL,
	"confidence" real,
	"has_visual_content" boolean DEFAULT false,
	"visual_content_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dimension_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"score" integer NOT NULL,
	"risk_rating" text NOT NULL,
	"findings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dimension_scores_batch_dimension_unique" UNIQUE("assessment_id","batch_id","dimension")
);
--> statement-breakpoint
CREATE TABLE "assessment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"composite_score" integer NOT NULL,
	"recommendation" text NOT NULL,
	"overall_risk_rating" text NOT NULL,
	"narrative_report" text,
	"executive_summary" text,
	"key_findings" jsonb,
	"disqualifying_factors" jsonb,
	"rubric_version" text NOT NULL,
	"model_id" text NOT NULL,
	"raw_tool_payload" jsonb,
	"scored_at" timestamp DEFAULT now() NOT NULL,
	"scoring_duration_ms" integer,
	CONSTRAINT "assessment_results_batch_unique" UNIQUE("assessment_id","batch_id")
);
--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_scores" ADD CONSTRAINT "dimension_scores_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "responses_assessment_batch_idx" ON "responses" USING btree ("assessment_id","batch_id");--> statement-breakpoint
CREATE INDEX "responses_position_idx" ON "responses" USING btree ("assessment_id","section_number","question_number");--> statement-breakpoint
CREATE INDEX "dimension_scores_assessment_idx" ON "dimension_scores" USING btree ("assessment_id","dimension");--> statement-breakpoint
CREATE INDEX "assessment_results_assessment_idx" ON "assessment_results" USING btree ("assessment_id");