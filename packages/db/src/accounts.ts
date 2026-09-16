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
