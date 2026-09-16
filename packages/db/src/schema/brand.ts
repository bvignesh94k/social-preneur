import {
  BRAND_RULE_TYPES,
  FACT_KINDS,
  FACT_STATUSES,
  OFFERING_KINDS,
  type BrandColor,
  type SocialLinks,
} from "@sp/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id, textList, updatedAt } from "./columns";
import { clients } from "./tenancy";

export const offeringKind = pgEnum("offering_kind", OFFERING_KINDS);
export const offeringStatus = pgEnum("offering_status", ["active", "archived"]);
export const factKind = pgEnum("fact_kind", FACT_KINDS);
export const factStatus = pgEnum("fact_status", FACT_STATUSES);
export const factSource = pgEnum("fact_source", ["manual", "website", "document"]);
export const brandRuleType = pgEnum("brand_rule_type", BRAND_RULE_TYPES);

export const brandProfiles = pgTable(
  "brand_profiles",
  {
    clientId: uuid("client_id").primaryKey(),
    agencyId: uuid("agency_id").notNull(),
    description: text("description"),
    targetAudience: text("target_audience"),
    targetLocations: textList("target_locations"),
    usps: textList("usps"),
    toneOfVoice: textList("tone_of_voice"),
    contentStyle: text("content_style"),
    primaryCta: text("primary_cta"),
    ctaUrl: text("cta_url"),
    phone: text("phone"),
    email: text("email"),
    brandColors: jsonb("brand_colors").$type<BrandColor[]>().notNull().default([]),
    fonts: textList("fonts"),
    preferredHashtags: textList("preferred_hashtags"),
    wordsToAvoid: textList("words_to_avoid"),
    socialLinks: jsonb("social_links").$type<SocialLinks>().notNull().default({}),
    brandCard: jsonb("brand_card").$type<Record<string, unknown>>(),
    brandCardGeneratedAt: timestamp("brand_card_generated_at", { withTimezone: true }),
    brandCardInputHash: text("brand_card_input_hash"),
    updatedBy: text("updated_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "brand_profiles_client_fk",
      columns: [t.agencyId, t.clientId],
      foreignColumns: [clients.agencyId, clients.id],
    }).onDelete("cascade"),
  ],
);

export const offerings = pgTable(
  "offerings",
  {
    id: id(),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    kind: offeringKind("kind").notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    benefits: textList("benefits"),
    audience: text("audience"),
    url: text("url"),
    status: offeringStatus("status").notNull().default("active"),
    lastPromotedAt: timestamp("last_promoted_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "offerings_client_fk",
      columns: [t.agencyId, t.clientId],
      foreignColumns: [clients.agencyId, clients.id],
    }).onDelete("cascade"),
    unique("offerings_client_id_uq").on(t.clientId, t.id),
    uniqueIndex("offerings_client_kind_name_uq").on(t.clientId, t.kind, sql`lower(${t.name})`),
    index("offerings_client_status_idx").on(t.clientId, t.status),
  ],
);

export const brandFacts = pgTable(
  "brand_facts",
  {
    id: id(),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    offeringId: uuid("offering_id"),
    kind: factKind("kind").notNull(),
    statement: text("statement").notNull(),
    sourceType: factSource("source_type").notNull().default("manual"),
    sourceRef: text("source_ref"),
    status: factStatus("status").notNull().default("unverified"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "brand_facts_client_fk",
      columns: [t.agencyId, t.clientId],
      foreignColumns: [clients.agencyId, clients.id],
    }).onDelete("cascade"),
    // Pins a fact's product or service to the same client.
    foreignKey({
      name: "brand_facts_offering_fk",
      columns: [t.clientId, t.offeringId],
      foreignColumns: [offerings.clientId, offerings.id],
    }),
    index("brand_facts_client_status_idx").on(t.clientId, t.status),
  ],
);

export const brandRules = pgTable(
  "brand_rules",
  {
    id: id(),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    type: brandRuleType("type").notNull(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "brand_rules_client_fk",
      columns: [t.agencyId, t.clientId],
      foreignColumns: [clients.agencyId, clients.id],
    }).onDelete("cascade"),
    uniqueIndex("brand_rules_single_use_uq")
      .on(t.clientId, t.type)
      .where(sql`${t.type} in ('max_hashtags', 'no_emojis', 'no_weekend_posts')`),
    index("brand_rules_client_idx").on(t.clientId),
  ],
);
