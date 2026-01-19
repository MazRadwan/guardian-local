ALTER TABLE "conversations" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "title_manually_edited" boolean DEFAULT false NOT NULL;