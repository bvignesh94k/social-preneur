import {
  CONTENT_CATEGORIES,
  IDEA_STATUSES,
  POST_SOURCES,
  POST_STATUSES,
  SOCIAL_PLATFORMS,
  VARIANT_STATUSES,
  type VariantIssue,
} from "@sp/core";
import {
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { offerings } from "./brand";
import { createdAt, id, textList, updatedAt } from "./columns";
import { clients, contentLanguage } from "./tenancy";

export const contentCategory = pgEnum("content_category", CONTENT_CATEGORIES);
export const postStatus = pgEnum("post_status", POST_STATUSES);
export const postSource = pgEnum("post_source", POST_SOURCES);
export const variantStatus = pgEnum("variant_status", VARIANT_STATUSES);
export const ideaStatus = pgEnum("idea_status", IDEA_STATUSES);
export const socialPlatform = pgEnum("social_platform", SOCIAL_PLATFORMS);

export const contentMix = pgTable(
  "content_mix",
  {
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    category: contentCategory("category").notNull(),
    targetPercent: integer("target_percent").notNull(),
    updatedBy: text("updated_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.clientId, t.category] }),
    foreignKey({
      name: "content_mix_client_fk",
      columns: [t.agencyId, t.clientId],
      foreignColumns: [clients.agencyId, clients.id],
    }).onDelete("cascade"),
  ],
);

export const ideas = pgTable(
  "ideas",
  {
    id: id(),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    hook: text("hook").notNull(),
    concept: text("concept"),
    angle: text("angle"),
    category: contentCategory("category").notNull(),
    source: postSource("source").notNull().default("ai"),
    sourceRef: text("source_ref"),
    offeringId: uuid("offering_id"),
    status: ideaStatus("status").notNull().default("new"),
    dismissedReason: text("dismissed_reason"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "ideas_client_fk",
      columns: [t.agencyId, t.clientId],
      foreignColumns: [clients.agencyId, clients.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "ideas_offering_fk",
      columns: [t.clientId, t.offeringId],
      foreignColumns: [offerings.clientId, offerings.id],
    }),
    unique("ideas_client_id_uq").on(t.clientId, t.id),
    index("ideas_client_status_idx").on(t.clientId, t.status),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: id(),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    title: text("title").notNull(),
    category: contentCategory("category").notNull(),
    status: postStatus("status").notNull().default("draft"),
    source: postSource("source").notNull().default("manual"),
    language: contentLanguage("language").notNull().default("en"),
    // The day the post belongs to in the client's own timezone; the calendar reads this.
    plannedDate: date("planned_date"),
    // The exact moment to publish, set once the post is scheduled.
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    caption: text("caption"),
    hashtags: textList("hashtags"),
    creativeBrief: text("creative_brief"),
    imagePrompt: text("image_prompt"),
    notes: text("notes"),
    offeringId: uuid("offering_id"),
    ideaId: uuid("idea_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "posts_client_fk",
      columns: [t.agencyId, t.clientId],
      foreignColumns: [clients.agencyId, clients.id],
    }).onDelete("cascade"),
    // Both links are pinned to the same client, so a post can never borrow
    // another client's product or idea.
    foreignKey({
      name: "posts_offering_fk",
      columns: [t.clientId, t.offeringId],
      foreignColumns: [offerings.clientId, offerings.id],
    }),
    foreignKey({
      name: "posts_idea_fk",
      columns: [t.clientId, t.ideaId],
      foreignColumns: [ideas.clientId, ideas.id],
    }),
    unique("posts_client_id_uq").on(t.clientId, t.id),
    index("posts_client_planned_idx").on(t.clientId, t.plannedDate),
    index("posts_client_status_idx").on(t.clientId, t.status),
    index("posts_agency_scheduled_idx").on(t.agencyId, t.scheduledAt),
  ],
);

export const postVariants = pgTable(
  "post_variants",
  {
    id: id(),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    postId: uuid("post_id").notNull(),
    platform: socialPlatform("platform").notNull(),
    caption: text("caption").notNull().default(""),
    title: text("title"),
    linkUrl: text("link_url"),
    firstComment: text("first_comment"),
    hashtags: textList("hashtags"),
    status: variantStatus("status").notNull().default("pending"),
    issues: jsonb("issues").$type<VariantIssue[]>().notNull().default([]),
    publishedUrl: text("published_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "post_variants_post_fk",
      columns: [t.clientId, t.postId],
      foreignColumns: [posts.clientId, posts.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "post_variants_client_fk",
      columns: [t.agencyId, t.clientId],
      foreignColumns: [clients.agencyId, clients.id],
    }).onDelete("cascade"),
    // One post has at most one version per platform.
    unique("post_variants_post_platform_uq").on(t.postId, t.platform),
    unique("post_variants_client_id_uq").on(t.clientId, t.id),
    index("post_variants_client_status_idx").on(t.clientId, t.status),
  ],
);
