CREATE TABLE "compliance_frameworks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_frameworks_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "framework_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_id" uuid NOT NULL,
	"version_label" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "framework_versions_framework_version_unique" UNIQUE("framework_id","version_label")
);
--> statement-breakpoint
CREATE TABLE "framework_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"clause_ref" text NOT NULL,
	"domain" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "framework_controls_version_clause_unique" UNIQUE("version_id","clause_ref")
);
--> statement-breakpoint
CREATE TABLE "interpretive_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_id" uuid NOT NULL,
	"criteria_version" text NOT NULL,
	"criteria_text" text NOT NULL,
	"assessment_guidance" text,
	"review_status" text DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp,
	"approved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "interpretive_criteria_control_version_unique" UNIQUE("control_id","criteria_version")
);
--> statement-breakpoint
CREATE TABLE "dimension_control_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"relevance_weight" real DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dimension_control_mappings_unique" UNIQUE("control_id","dimension")
);
--> statement-breakpoint
CREATE TABLE "assessment_compliance_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"framework_version_id" uuid NOT NULL,
	"criteria_version" text NOT NULL,
	"control_id" uuid NOT NULL,
	"finding" jsonb,
	"evidence_refs" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_compliance_results_unique" UNIQUE("assessment_id","control_id","criteria_version")
);
--> statement-breakpoint
ALTER TABLE "framework_versions" ADD CONSTRAINT "framework_versions_framework_id_compliance_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."compliance_frameworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_controls" ADD CONSTRAINT "framework_controls_version_id_framework_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."framework_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpretive_criteria" ADD CONSTRAINT "interpretive_criteria_control_id_framework_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."framework_controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_control_mappings" ADD CONSTRAINT "dimension_control_mappings_control_id_framework_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."framework_controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_compliance_results" ADD CONSTRAINT "assessment_compliance_results_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_compliance_results" ADD CONSTRAINT "assessment_compliance_results_framework_version_id_framework_versions_id_fk" FOREIGN KEY ("framework_version_id") REFERENCES "public"."framework_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_compliance_results" ADD CONSTRAINT "assessment_compliance_results_control_id_framework_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."framework_controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "framework_versions_framework_idx" ON "framework_versions" USING btree ("framework_id");--> statement-breakpoint
CREATE INDEX "framework_controls_version_clause_idx" ON "framework_controls" USING btree ("version_id","clause_ref");--> statement-breakpoint
CREATE INDEX "interpretive_criteria_control_version_idx" ON "interpretive_criteria" USING btree ("control_id","criteria_version");--> statement-breakpoint
CREATE INDEX "dimension_control_mappings_dimension_idx" ON "dimension_control_mappings" USING btree ("dimension","control_id");--> statement-breakpoint
CREATE INDEX "assessment_compliance_results_assessment_idx" ON "assessment_compliance_results" USING btree ("assessment_id");