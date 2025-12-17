-- Epic 16.6.8: Add attachments column to messages table
-- This enables file attachments to be stored with user messages
ALTER TABLE "messages" ADD COLUMN "attachments" jsonb;
