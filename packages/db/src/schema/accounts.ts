import { SOCIAL_PLATFORMS } from "@sp/core";
import { foreignKey, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id, updatedAt } from "./columns";
import { clients } from "./tenancy";

export const socialAccountPlatform = pgEnum("social_account_platform", SOCIAL_PLATFORMS);

// A connection goes through three real states: nothing set up, working by hand
// while the platform reviews the app, then posting on its own once approved.
export const accountConnectionMode = pgEnum("account_connection_mode", ["assisted", "automatic"]);
export const accountHealth = pgEnum("account_health", ["ok", "needs_attention", "disconnected"]);

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: id(),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    platform: socialAccountPlatform("platform").notNull(),
    displayName: text("display_name").notNull(),
    handle: text("handle"),
    profileUrl: text("profile_url"),
    // Assisted until the platform approves the app for this account; nothing here
    // ever claims to be automatic unless a real connection backs it.
    connectionMode: accountConnectionMode("connection_mode").notNull().default("assisted"),
    health: accountHealth("health").notNull().default("ok"),
    healthNote: text("health_note"),
    // Filled in once real OAuth is wired up for that platform. Null until then.
    externalAccountId: text("external_account_id"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "social_accounts_client_fk",
      columns: [t.agencyId, t.clientId],
      foreignColumns: [clients.agencyId, clients.id],
    }).onDelete("cascade"),
    // One row per platform per client. A client with two Facebook Pages still
    // gets one entry, since the app manages one account per platform for now.
    unique("social_accounts_client_platform_uq").on(t.clientId, t.platform),
    unique("social_accounts_client_id_uq").on(t.clientId, t.id),
    index("social_accounts_client_idx").on(t.clientId),
  ],
);
