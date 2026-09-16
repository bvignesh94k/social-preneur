CREATE TYPE "public"."ai_run_status" AS ENUM('ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."brand_suggestion_kind" AS ENUM('profile_field', 'offering', 'fact');--> statement-breakpoint
CREATE TYPE "public"."brand_suggestion_status" AS ENUM('pending', 'accepted', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."website_scan_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid,
	"user_id" text,
	"feature" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"thinking_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"status" "ai_run_status" NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_suggestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"scan_id" uuid,
	"kind" "brand_suggestion_kind" NOT NULL,
	"field" text,
	"payload" jsonb NOT NULL,
	"source_url" text,
	"status" "brand_suggestion_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"category" text NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_scans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"url" text NOT NULL,
	"status" "website_scan_status" DEFAULT 'queued' NOT NULL,
	"pages_read" integer DEFAULT 0 NOT NULL,
	"pages_skipped" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "website_scans_client_id_uq" UNIQUE("client_id","id")
);
--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "brand_card" jsonb;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "brand_card_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "brand_card_input_hash" text;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_suggestions" ADD CONSTRAINT "brand_suggestions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_suggestions" ADD CONSTRAINT "brand_suggestions_client_fk" FOREIGN KEY ("agency_id","client_id") REFERENCES "public"."clients"("agency_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_suggestions" ADD CONSTRAINT "brand_suggestions_scan_fk" FOREIGN KEY ("client_id","scan_id") REFERENCES "public"."website_scans"("client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_pages" ADD CONSTRAINT "website_pages_client_fk" FOREIGN KEY ("agency_id","client_id") REFERENCES "public"."clients"("agency_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_pages" ADD CONSTRAINT "website_pages_scan_fk" FOREIGN KEY ("client_id","scan_id") REFERENCES "public"."website_scans"("client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_scans" ADD CONSTRAINT "website_scans_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_scans" ADD CONSTRAINT "website_scans_client_fk" FOREIGN KEY ("agency_id","client_id") REFERENCES "public"."clients"("agency_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_runs_agency_created_idx" ON "ai_runs" USING btree ("agency_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_runs_client_created_idx" ON "ai_runs" USING btree ("client_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "brand_suggestions_client_status_idx" ON "brand_suggestions" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "website_pages_scan_idx" ON "website_pages" USING btree ("scan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "website_scans_one_active_uq" ON "website_scans" USING btree ("client_id") WHERE "website_scans"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "website_scans_client_created_idx" ON "website_scans" USING btree ("client_id","created_at" DESC NULLS LAST);