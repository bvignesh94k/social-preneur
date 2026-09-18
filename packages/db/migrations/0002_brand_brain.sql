CREATE TYPE "public"."brand_rule_type" AS ENUM('max_hashtags', 'no_emojis', 'blocked_phrase', 'required_phrase', 'no_weekend_posts', 'custom');--> statement-breakpoint
CREATE TYPE "public"."fact_kind" AS ENUM('statistic', 'certification', 'award', 'specification', 'testimonial', 'client_result', 'other');--> statement-breakpoint
CREATE TYPE "public"."fact_source" AS ENUM('manual', 'website', 'document');--> statement-breakpoint
CREATE TYPE "public"."fact_status" AS ENUM('unverified', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."offering_kind" AS ENUM('product', 'service');--> statement-breakpoint
CREATE TYPE "public"."offering_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "brand_facts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"offering_id" uuid,
	"kind" "fact_kind" NOT NULL,
	"statement" text NOT NULL,
	"source_type" "fact_source" DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"status" "fact_status" DEFAULT 'unverified' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_profiles" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"description" text,
	"target_audience" text,
	"target_locations" text[] DEFAULT '{}'::text[] NOT NULL,
	"usps" text[] DEFAULT '{}'::text[] NOT NULL,
	"tone_of_voice" text[] DEFAULT '{}'::text[] NOT NULL,
	"content_style" text,
	"primary_cta" text,
	"cta_url" text,
	"phone" text,
	"email" text,
	"brand_colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fonts" text[] DEFAULT '{}'::text[] NOT NULL,
	"preferred_hashtags" text[] DEFAULT '{}'::text[] NOT NULL,
	"words_to_avoid" text[] DEFAULT '{}'::text[] NOT NULL,
	"social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"type" "brand_rule_type" NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offerings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" "offering_kind" NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"benefits" text[] DEFAULT '{}'::text[] NOT NULL,
	"audience" text,
	"url" text,
	"status" "offering_status" DEFAULT 'active' NOT NULL,
	"last_promoted_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offerings_client_id_uq" UNIQUE("client_id","id")
);
--> statement-breakpoint
ALTER TABLE "brand_facts" ADD CONSTRAINT "brand_facts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_facts" ADD CONSTRAINT "brand_facts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_facts" ADD CONSTRAINT "brand_facts_client_fk" FOREIGN KEY ("agency_id","client_id") REFERENCES "public"."clients"("agency_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_facts" ADD CONSTRAINT "brand_facts_offering_fk" FOREIGN KEY ("client_id","offering_id") REFERENCES "public"."offerings"("client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_client_fk" FOREIGN KEY ("agency_id","client_id") REFERENCES "public"."clients"("agency_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_rules" ADD CONSTRAINT "brand_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_rules" ADD CONSTRAINT "brand_rules_client_fk" FOREIGN KEY ("agency_id","client_id") REFERENCES "public"."clients"("agency_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_client_fk" FOREIGN KEY ("agency_id","client_id") REFERENCES "public"."clients"("agency_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_facts_client_status_idx" ON "brand_facts" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_rules_single_use_uq" ON "brand_rules" USING btree ("client_id","type") WHERE "brand_rules"."type" in ('max_hashtags', 'no_emojis', 'no_weekend_posts');--> statement-breakpoint
CREATE INDEX "brand_rules_client_idx" ON "brand_rules" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offerings_client_kind_name_uq" ON "offerings" USING btree ("client_id","kind",lower("name"));--> statement-breakpoint
CREATE INDEX "offerings_client_status_idx" ON "offerings" USING btree ("client_id","status");