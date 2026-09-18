CREATE TYPE "public"."account_connection_mode" AS ENUM('assisted', 'automatic');--> statement-breakpoint
CREATE TYPE "public"."account_health" AS ENUM('ok', 'needs_attention', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."social_account_platform" AS ENUM('linkedin', 'facebook', 'instagram', 'x', 'threads', 'pinterest');--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"platform" "social_account_platform" NOT NULL,
	"display_name" text NOT NULL,
	"handle" text,
	"profile_url" text,
	"connection_mode" "account_connection_mode" DEFAULT 'assisted' NOT NULL,
	"health" "account_health" DEFAULT 'ok' NOT NULL,
	"health_note" text,
	"external_account_id" text,
	"connected_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_accounts_client_platform_uq" UNIQUE("client_id","platform"),
	CONSTRAINT "social_accounts_client_id_uq" UNIQUE("client_id","id")
);
--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_client_fk" FOREIGN KEY ("agency_id","client_id") REFERENCES "public"."clients"("agency_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_accounts_client_idx" ON "social_accounts" USING btree ("client_id");