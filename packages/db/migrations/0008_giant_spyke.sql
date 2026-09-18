ALTER TABLE "social_accounts" ADD COLUMN "access_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "refresh_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "granted_scopes" text[] DEFAULT '{}'::text[] NOT NULL;