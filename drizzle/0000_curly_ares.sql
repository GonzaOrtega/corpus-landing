CREATE TYPE "public"."confirmation_status" AS ENUM('pending', 'sent', 'failed', 'exhausted');--> statement-breakpoint
CREATE TYPE "public"."launch_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'manual_review');--> statement-breakpoint
CREATE TABLE "early_access_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_original" text,
	"email_normalized" text,
	"consent_version" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	"manage_token_hash" text,
	"confirmation_status" "confirmation_status" DEFAULT 'pending' NOT NULL,
	"confirmation_attempt_count" integer DEFAULT 0 NOT NULL,
	"confirmation_last_attempt_at" timestamp with time zone,
	"confirmation_next_attempt_at" timestamp with time zone,
	"confirmation_sent_at" timestamp with time zone,
	"launch_status" "launch_status" DEFAULT 'pending' NOT NULL,
	"launch_attempt_count" integer DEFAULT 0 NOT NULL,
	"launch_last_attempt_at" timestamp with time zone,
	"launch_sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "early_access_signups_email_normalized_active_idx" ON "early_access_signups" USING btree ("email_normalized") WHERE "early_access_signups"."anonymized_at" is null and "early_access_signups"."email_normalized" is not null;