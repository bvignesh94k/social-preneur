import { AGENCY_ROLES, CLIENT_ROLES } from "@sp/core";
import {
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
import { createdAt, id, updatedAt } from "./columns";

export const agencyRole = pgEnum("agency_role", AGENCY_ROLES);
export const clientRole = pgEnum("client_role", CLIENT_ROLES);
export const memberStatus = pgEnum("member_status", ["active", "suspended"]);
export const clientStatus = pgEnum("client_status", ["onboarding", "active", "archived"]);
export const contentLanguage = pgEnum("content_language", ["en", "ta", "en_ta"]);
export const approvalMode = pgEnum("approval_mode", ["internal_only", "internal_and_client"]);
export const actorType = pgEnum("actor_type", ["user", "approval_link", "system"]);

export const agencies = pgTable("agencies", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  publishingPausedAt: timestamp("publishing_paused_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const agencyMembers = pgTable(
  "agency_members",
  {
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: agencyRole("role").notNull(),
    status: memberStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.agencyId, t.userId] }),
    index("agency_members_user_idx").on(t.userId),
  ],
);

export const clients = pgTable(
  "clients",
  {
    id: id(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    website: text("website"),
    industry: text("industry"),
    country: text("country").notNull().default("IN"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    defaultLanguage: contentLanguage("default_language").notNull().default("en"),
    approvalMode: approvalMode("approval_mode").notNull().default("internal_and_client"),
    lateWindowMinutes: integer("late_window_minutes").notNull().default(180),
    publishingPausedAt: timestamp("publishing_paused_at", { withTimezone: true }),
    status: clientStatus("status").notNull().default("onboarding"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("clients_agency_slug_uq").on(t.agencyId, t.slug),
    // Target for composite foreign keys that pin child rows to the same agency.
    unique("clients_agency_id_uq").on(t.agencyId, t.id),
    index("clients_agency_status_idx").on(t.agencyId, t.status),
  ],
);

export const clientMembers = pgTable(
  "client_members",
  {
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    userId: text("user_id").notNull(),
    role: clientRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.clientId, t.userId] }),
    foreignKey({
      name: "client_members_client_fk",
      columns: [t.agencyId, t.clientId],
      foreignColumns: [clients.agencyId, clients.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "client_members_member_fk",
      columns: [t.agencyId, t.userId],
      foreignColumns: [agencyMembers.agencyId, agencyMembers.userId],
    }).onDelete("cascade"),
    index("client_members_user_idx").on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id"),
    email: text("email").notNull(),
    agencyRole: agencyRole("agency_role").notNull(),
    clientRole: clientRole("client_role"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "invitations_client_fk",
      columns: [t.agencyId, t.clientId],
      foreignColumns: [clients.agencyId, clients.id],
    }).onDelete("cascade"),
    index("invitations_agency_email_idx").on(t.agencyId, t.email),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id),
    clientId: uuid("client_id"),
    actorType: actorType("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_agency_created_idx").on(t.agencyId, t.createdAt.desc()),
    index("audit_logs_client_created_idx").on(t.clientId, t.createdAt.desc()),
  ],
);
