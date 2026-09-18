import {
  InvalidInputError,
  NotFoundError,
  SOCIAL_PLATFORMS,
  type Actor,
  type SocialPlatform,
} from "@sp/core";
import { and, eq } from "drizzle-orm";
import { requireClientAccess, type ClientScope } from "./access";
import { recordAudit } from "./audit";
import type { Database } from "./client";
import { socialAccounts } from "./schema";

export type SocialAccount = typeof socialAccounts.$inferSelect;

function audit(scope: ClientScope) {
  return { agencyId: scope.agencyId, clientId: scope.clientId, actorType: "user" as const, actorId: scope.actor.userId };
}

export async function listSocialAccounts(db: Database, scope: ClientScope): Promise<SocialAccount[]> {
  const rows = await db.select().from(socialAccounts).where(eq(socialAccounts.clientId, scope.clientId));
  const order = new Map(SOCIAL_PLATFORMS.map((platform, index) => [platform, index]));
  return rows.sort((a, b) => (order.get(a.platform) ?? 0) - (order.get(b.platform) ?? 0));
}

export interface SocialAccountInput {
  displayName: string;
  handle?: string | null;
  profileUrl?: string | null;
  healthNote?: string | null;
}

function cleanAccount(input: SocialAccountInput) {
  const displayName = input.displayName.trim();
  if (!displayName) throw new InvalidInputError("Give the page or profile a name so you can recognise it.");

  const profileUrl = input.profileUrl?.trim() || null;
  if (profileUrl && !/^https?:\/\//i.test(profileUrl)) {
    throw new InvalidInputError("The profile link needs to start with http:// or https://");
  }

  return {
    displayName,
    handle: input.handle?.trim().replace(/^@/, "") || null,
    profileUrl,
    healthNote: input.healthNote?.trim() || null,
  };
}

// Registers which page or profile belongs to this client, in assisted mode.
// It becomes a real connection once that platform approves the app and OAuth
// runs for this account; nothing here fakes automatic publishing before then.
export async function addSocialAccount(
  db: Database,
  actor: Actor,
  clientId: string,
  platform: SocialPlatform,
  input: SocialAccountInput,
): Promise<SocialAccount> {
  const scope = await requireClientAccess(db, actor, "accounts.connect", clientId);
  const clean = cleanAccount(input);

  const existing = await db
    .select({ id: socialAccounts.id })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.clientId, scope.clientId), eq(socialAccounts.platform, platform)))
    .limit(1);
  if (existing.length > 0) {
    throw new InvalidInputError(`This client already has a ${platform} account. Edit it instead of adding another.`);
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(socialAccounts)
      .values({
        ...clean,
        agencyId: scope.agencyId,
        clientId: scope.clientId,
        platform,
        connectionMode: "assisted",
        health: "ok",
        createdBy: actor.userId,
      })
      .returning();
    if (!row) throw new Error("Account insert returned no row");

    await recordAudit(tx, {
      ...audit(scope),
      action: "accounts.added",
      objectType: "social_account",
      objectId: row.id,
      after: { platform, displayName: row.displayName },
    });
    return row;
  });
}

export async function updateSocialAccount(
  db: Database,
  actor: Actor,
  clientId: string,
  accountId: string,
  input: SocialAccountInput,
): Promise<SocialAccount> {
  const scope = await requireClientAccess(db, actor, "accounts.connect", clientId);
  const clean = cleanAccount(input);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(socialAccounts)
      .set(clean)
      .where(and(eq(socialAccounts.clientId, scope.clientId), eq(socialAccounts.id, accountId)))
      .returning();
    if (!row) throw new NotFoundError("Account");

    await recordAudit(tx, {
      ...audit(scope),
      action: "accounts.updated",
      objectType: "social_account",
      objectId: row.id,
      after: { displayName: row.displayName },
    });
    return row;
  });
}

export interface OAuthConnectionInput {
  displayName: string;
  externalAccountId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date;
  grantedScopes: string[];
}

// Upserts the one row per client per platform, same as the manual path, but
// marks it automatic and carries the encrypted token. Requires no separate
// permission check beyond accounts.connect: connecting an account and typing
// its name in by hand are the same authority over the same row.
export async function saveOAuthConnection(
  db: Database,
  actor: Actor,
  clientId: string,
  platform: SocialPlatform,
  input: OAuthConnectionInput,
): Promise<SocialAccount> {
  const scope = await requireClientAccess(db, actor, "accounts.connect", clientId);

  return db.transaction(async (tx) => {
    const values = {
      agencyId: scope.agencyId,
      clientId: scope.clientId,
      platform,
      displayName: input.displayName,
      connectionMode: "automatic" as const,
      health: "ok" as const,
      healthNote: null,
      externalAccountId: input.externalAccountId,
      connectedAt: new Date(),
      accessTokenEncrypted: input.accessTokenEncrypted,
      refreshTokenEncrypted: input.refreshTokenEncrypted,
      tokenExpiresAt: input.tokenExpiresAt,
      grantedScopes: input.grantedScopes,
      createdBy: actor.userId,
    };

    const [row] = await tx
      .insert(socialAccounts)
      .values(values)
      .onConflictDoUpdate({
        target: [socialAccounts.clientId, socialAccounts.platform],
        set: {
          displayName: values.displayName,
          connectionMode: values.connectionMode,
          health: values.health,
          healthNote: values.healthNote,
          externalAccountId: values.externalAccountId,
          connectedAt: values.connectedAt,
          accessTokenEncrypted: values.accessTokenEncrypted,
          refreshTokenEncrypted: values.refreshTokenEncrypted,
          tokenExpiresAt: values.tokenExpiresAt,
          grantedScopes: values.grantedScopes,
        },
      })
      .returning();
    if (!row) throw new Error("Account upsert returned no row");

    await recordAudit(tx, {
      ...audit(scope),
      action: "accounts.connected",
      objectType: "social_account",
      objectId: row.id,
      after: { platform, displayName: row.displayName, externalAccountId: row.externalAccountId },
    });
    return row;
  });
}

// Clears the token and drops the account back to assisted mode rather than
// deleting the row, so the registered page/profile name is not lost.
export async function disconnectOAuthAccount(
  db: Database,
  actor: Actor,
  clientId: string,
  platform: SocialPlatform,
): Promise<SocialAccount> {
  const scope = await requireClientAccess(db, actor, "accounts.connect", clientId);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(socialAccounts)
      .set({
        connectionMode: "assisted",
        health: "ok",
        healthNote: null,
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        tokenExpiresAt: null,
        grantedScopes: [],
      })
      .where(and(eq(socialAccounts.clientId, scope.clientId), eq(socialAccounts.platform, platform)))
      .returning();
    if (!row) throw new NotFoundError("Account");

    await recordAudit(tx, {
      ...audit(scope),
      action: "accounts.disconnected",
      objectType: "social_account",
      objectId: row.id,
      before: { platform },
    });
    return row;
  });
}

export async function removeSocialAccount(
  db: Database,
  actor: Actor,
  clientId: string,
  accountId: string,
): Promise<void> {
  const scope = await requireClientAccess(db, actor, "accounts.connect", clientId);

  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(socialAccounts)
      .where(and(eq(socialAccounts.clientId, scope.clientId), eq(socialAccounts.id, accountId)))
      .returning({ id: socialAccounts.id, platform: socialAccounts.platform });
    if (!row) throw new NotFoundError("Account");

    await recordAudit(tx, {
      ...audit(scope),
      action: "accounts.removed",
      objectType: "social_account",
      objectId: row.id,
      before: { platform: row.platform },
    });
  });
}
