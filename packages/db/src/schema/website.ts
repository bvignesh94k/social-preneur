import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
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
import { createdAt, id } from "./columns";
import { clients } from "./tenancy";

export const websiteScanStatus = pgEnum("website_scan_status", ["queued", "running", "done", "failed"]);
export const suggestionKind = pgEnum("brand_suggestion_kind", ["profile_field", "offering", "fact"]);
export const suggestionStatus = pgEnum("brand_suggestion_status", ["pending", "accepted", "dismissed"]);

export const websiteScans = pgTable(
  "website_scans",
  {
    id: id(),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    url: text("url").notNull(),
    status: websiteScanStatus("status").notNull().default("queued"),
    pagesRead: integer("pages_read").notNull().default(0),
    pagesSkipped: integer("pages_skipped").notNull().default(0),
    errorMessage: text("error_message"),
    startedBy: text("started_by").references(() => users.id),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: "website_scans_client_fk",
      columns: [t.agencyId, t.clientId],
      foreignColumns: [clients.agencyId, clients.id],
    }).onDelete("cascade"),
    unique("website_scans_client_id_uq").on(t.clientId, t.id),
    // One scan at a time per client.
    uniqueIndex("website_scans_one_active_uq")
      .on(t.clientId)
      .where(sql`${t.status} in ('queued', 'running')`),
    index("website_scans_client_created_idx").on(t.clientId, t.createdAt.desc()),
  ],
);

export const websitePages = pgTable(
  "website_pages",
  {
    id: id(),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    scanId: uuid("scan_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    category: text("category").notNull(),
    summary: text("summary"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "website_pages_client_fk",
      columns: [t.agencyId, t.clientId],
      foreignColumns: [clients.agencyId, clients.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "website_pages_scan_fk",
      columns: [t.clientId, t.scanId],
      foreignColumns: [websiteScans.clientId, websiteScans.id],
    }).onDelete("cascade"),
    index("website_pages_scan_idx").on(t.scanId),
  ],
);

export const brandSuggestions = pgTable(
  "brand_suggestions",
  {
    id: id(),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    scanId: uuid("scan_id"),
    kind: suggestionKind("kind").notNull(),
    field: text("field"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    sourceUrl: text("source_url"),
    status: suggestionStatus("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "brand_suggestions_client_fk",
      columns: [t.agencyId, t.clientId],
      foreignColumns: [clients.agencyId, clients.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "brand_suggestions_scan_fk",
      columns: [t.clientId, t.scanId],
      foreignColumns: [websiteScans.clientId, websiteScans.id],
    }).onDelete("cascade"),
    index("brand_suggestions_client_status_idx").on(t.clientId, t.status),
  ],
);
