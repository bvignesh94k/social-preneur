CREATE TYPE "public"."content_category" AS ENUM('educational', 'promotional', 'social_proof', 'engagement', 'behind_the_scenes', 'news');--> statement-breakpoint
CREATE TYPE "public"."idea_status" AS ENUM('new', 'used', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."post_source" AS ENUM('manual', 'ai', 'trend', 'special_day', 'repurpose');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('idea', 'draft', 'needs_creative', 'ready', 'scheduled', 'published', 'failed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('linkedin', 'facebook', 'instagram', 'x', 'threads', 'pinterest');--> statement-breakpoint
CREATE TYPE "public"."variant_status" AS ENUM('pending', 'ready', 'queued', 'published', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "content_mix" (
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"category" "content_category" NOT NULL,
	"target_percent" integer NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_mix_client_id_category_pk" PRIMARY KEY("client_id","category")
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"hook" text NOT NULL,
	"concept" text,
	"angle" text,
	"category" "content_category" NOT NULL,
	"source" "post_source" DEFAULT 'ai' NOT NULL,
	"source_ref" text,
	"offering_id" uuid,
	"status" "idea_status" DEFAULT 'new' NOT NULL,
	"dismissed_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ideas_client_id_uq" UNIQUE("client_id","id")
);
--> statement-breakpoint
CREATE TABLE "post_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"title" text,
	"link_url" text,
	"first_comment" text,
	"hashtags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "variant_status" DEFAULT 'pending' NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_url" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_variants_post_platform_uq" UNIQUE("post_id","platform"),
	CONSTRAINT "post_variants_client_id_uq" UNIQUE("client_id","id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" "content_category" NOT NULL,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"source" "post_source" DEFAULT 'manual' NOT NULL,
	"language" "content_language" DEFAULT 'en' NOT NULL,
	"planned_date" date,
	"scheduled_at" timestamp with time zone,
	"caption" text,
	"hashtags" text[] DEFAULT '{}'::text[] NOT NULL,
	"creative_brief" text,
	"image_prompt" text,
	"notes" text,
	"offering_id" uuid,
	"idea_id" uuid,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_client_id_uq" UNIQUE("client_id","id")
);
--> statement-breakpoint
ALTER TABLE "content_mix" ADD CONSTRAINT "content_mix_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_mix" ADD CONSTRAINT "content_mix_client_fk" FOREIGN KEY ("agency_id","client_id") REFERENCES "public"."clients"("agency_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_client_fk" FOREIGN KEY ("agency_id","client_id") REFERENCES "public"."clients"("agency_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_offering_fk" FOREIGN KEY ("client_id","offering_id") REFERENCES "public"."offerings"("client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_variants" ADD CONSTRAINT "post_variants_post_fk" FOREIGN KEY ("client_id","post_id") REFERENCES "public"."posts"("client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_variants" ADD CONSTRAINT "post_variants_client_fk" FOREIGN KEY ("agency_id","client_id") REFERENCES "public"."clients"("agency_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_client_fk" FOREIGN KEY ("agency_id","client_id") REFERENCES "public"."clients"("agency_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_offering_fk" FOREIGN KEY ("client_id","offering_id") REFERENCES "public"."offerings"("client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_idea_fk" FOREIGN KEY ("client_id","idea_id") REFERENCES "public"."ideas"("client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ideas_client_status_idx" ON "ideas" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "post_variants_client_status_idx" ON "post_variants" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "posts_client_planned_idx" ON "posts" USING btree ("client_id","planned_date");--> statement-breakpoint
CREATE INDEX "posts_client_status_idx" ON "posts" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "posts_agency_scheduled_idx" ON "posts" USING btree ("agency_id","scheduled_at");