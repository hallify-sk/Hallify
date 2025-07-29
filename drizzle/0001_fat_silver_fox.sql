CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"sender_id" integer,
	"sender_type" varchar(50) NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"guest_identifier" varchar(255),
	"user_id" integer,
	"assigned_admin_id" integer,
	"status" varchar(50) DEFAULT 'active',
	"subject" varchar(255),
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_assigned_admin_id_users_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;