DROP TABLE "chat_messages" CASCADE;--> statement-breakpoint
DROP TABLE "chat_sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "table_layout_data" json;