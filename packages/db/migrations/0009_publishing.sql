ALTER TABLE "post_variants" ADD COLUMN "external_post_id" text;--> statement-breakpoint
ALTER TABLE "post_variants" ADD COLUMN "publish_error" text;--> statement-breakpoint
ALTER TABLE "post_variants" ADD COLUMN "publish_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "post_variants" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "post_variants_platform_status_idx" ON "post_variants" USING btree ("platform","status");