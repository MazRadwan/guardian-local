ALTER TABLE "files" ADD COLUMN "text_excerpt" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "parse_status" varchar(20) DEFAULT 'pending';