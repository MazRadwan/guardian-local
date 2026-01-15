CREATE INDEX "responses_batch_id_idx" ON "responses" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "responses_created_at_idx" ON "responses" USING btree ("created_at");