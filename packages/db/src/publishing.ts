import { InvalidInputError, NotFoundError, type Actor, type PostStatus, type SocialPlatform } from "@sp/core";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, sql, type SQL } from "drizzle-orm";
import { requireClientAccess, type ClientScope } from "./access";
import { recordAudit } from "./audit";
import type { Database } from "./client";
import { agencies, clients, postVariants, posts, socialAccounts } from "./schema";

// A job that keeps failing for a temporary reason (rate limit, platform outage)
// is retried on later runs until this many attempts, then left for a person.
export const MAX_PUBLISH_ATTEMPTS = 3;
export const STALE_CLAIM_MINUTES = 15;

const PUBLISHER = { actorType: "system" as const, actorId: "publisher" };

export interface PublishJob {
  variantId: string;
  postId: string;
  agencyId: string;
  clientId: string;
  caption: string;
  hashtags: string[];
  linkUrl: string | null;
  attempt: number;
  account: {
    id: string;
    externalAccountId: string;
    accessTokenEncrypted: string;
    tokenExpiresAt: Date | null;
  };
}

// Everything that must be true for the publisher to post a version on its own.
// Versions with media stay manual: the image lives outside the app, and posting
// the text alone would publish something the team did not intend.
function eligible(platform: SocialPlatform, now: Date): SQL {
  return and(
    eq(postVariants.platform, platform),
    eq(postVariants.status, "ready"),
    eq(postVariants.hasMedia, false),
    eq(posts.status, "scheduled"),
    lte(posts.scheduledAt, now),
    eq(socialAccounts.connectionMode, "automatic"),
    isNotNull(socialAccounts.accessTokenEncrypted),
    isNotNull(socialAccounts.externalAccountId),
    ne(socialAccounts.health, "disconnected"),
    isNull(clients.publishingPausedAt),
    isNull(agencies.publishingPausedAt),
    ne(clients.status, "archived"),
  )!;
}

function withinLateWindow(now: Date): SQL {
  return sql`${posts.scheduledAt} + (${clients.lateWindowMinutes} * interval '1 minute') >= ${now.toISOString()}::timestamptz`;
}

function pastLateWindow(now: Date): SQL {
  return sql`${posts.scheduledAt} + (${clients.lateWindowMinutes} * interval '1 minute') < ${now.toISOString()}::timestamptz`;
}

function dueQuery(db: Database, platform: SocialPlatform) {
  return db
    .select({
      id: postVariants.id,
      postId: postVariants.postId,
      agencyId: postVariants.agencyId,
      clientId: postVariants.clientId,
      lateWindowMinutes: clients.lateWindowMinutes,
    })
    .from(postVariants)
    .innerJoin(posts, and(eq(posts.id, postVariants.postId), eq(posts.clientId, postVariants.clientId)))
    .innerJoin(clients, eq(clients.id, postVariants.clientId))
    .innerJoin(agencies, eq(agencies.id, postVariants.agencyId))
    // Both tables keep their own platform enum, so each side is pinned to the
    // same literal rather than compared column to column.
    .innerJoin(socialAccounts, and(eq(socialAccounts.clientId, postVariants.clientId), eq(socialAccounts.platform, platform)));
}

// Keeps the post's own status in step with its platform versions. Runs inside
// the same transaction as whatever changed a version.
async function settlePost(tx: Database, postId: string, actorAudit: { actorType: "user" | "system"; actorId: string }) {
  const [post] = await tx
    .select({ status: posts.status, scheduledAt: posts.scheduledAt, agencyId: posts.agencyId, clientId: posts.clientId })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  if (!post || !["scheduled", "ready", "failed"].includes(post.status)) return;

  const variants = await tx
    .select({ status: postVariants.status, publishedAt: postVariants.publishedAt })
    .from(postVariants)
    .where(eq(postVariants.postId, postId));
  if (variants.length === 0) return;

  let next: PostStatus = post.status;
  let publishedAt: Date | null = null;

  if (variants.some((v) => v.status === "failed")) {
    next = "failed";
  } else if (
    variants.every((v) => v.status === "published" || v.status === "skipped") &&
    variants.some((v) => v.status === "published")
  ) {
    next = "published";
    publishedAt = variants.reduce<Date | null>(
      (latest, v) => (v.publishedAt && (!latest || v.publishedAt > latest) ? v.publishedAt : latest),
      null,
    );
  } else if (post.status === "failed") {
    next = post.scheduledAt ? "scheduled" : "ready";
  }

  if (next === post.status) return;

  await tx
    .update(posts)
    .set(next === "published" ? { status: next, publishedAt: publishedAt ?? new Date() } : { status: next })
    .where(eq(posts.id, postId));

  await recordAudit(tx, {
    agencyId: post.agencyId,
    clientId: post.clientId,
    ...actorAudit,
    action: "content.post_status_changed",
    objectType: "post",
    objectId: postId,
    before: { status: post.status },
    after: { status: next },
  });
}

// ---------- Used by the publisher, which acts as the system ----------

export async function claimDuePublishJobs(
  db: Database,
  platform: SocialPlatform,
  now: Date,
  limit: number,
): Promise<PublishJob[]> {
  return db.transaction(async (tx) => {
    const due = await dueQuery(tx, platform)
      .where(and(eligible(platform, now), withinLateWindow(now)))
      .orderBy(asc(posts.scheduledAt))
      .limit(limit)
      // Two overlapping runs can never take the same version.
      .for("update", { of: postVariants, skipLocked: true });
    if (due.length === 0) return [];

    const ids = due.map((row) => row.id);
    await tx
      .update(postVariants)
      .set({
        status: "queued",
        claimedAt: now,
        publishError: null,
        publishAttempts: sql`${postVariants.publishAttempts} + 1`,
      })
      .where(inArray(postVariants.id, ids));

    const rows = await tx
      .select({
        variantId: postVariants.id,
        postId: postVariants.postId,
        agencyId: postVariants.agencyId,
        clientId: postVariants.clientId,
        caption: postVariants.caption,
        hashtags: postVariants.hashtags,
        linkUrl: postVariants.linkUrl,
        attempt: postVariants.publishAttempts,
        accountId: socialAccounts.id,
        externalAccountId: socialAccounts.externalAccountId,
        accessTokenEncrypted: socialAccounts.accessTokenEncrypted,
        tokenExpiresAt: socialAccounts.tokenExpiresAt,
      })
      .from(postVariants)
      .innerJoin(
        socialAccounts,
        and(eq(socialAccounts.clientId, postVariants.clientId), eq(socialAccounts.platform, platform)),
      )
      .where(inArray(postVariants.id, ids));

    return rows.map((row) => ({
      variantId: row.variantId,
      postId: row.postId,
      agencyId: row.agencyId,
      clientId: row.clientId,
      caption: row.caption,
      hashtags: row.hashtags,
      linkUrl: row.linkUrl,
      attempt: row.attempt,
      account: {
        id: row.accountId,
        externalAccountId: row.externalAccountId!,
        accessTokenEncrypted: row.accessTokenEncrypted!,
        tokenExpiresAt: row.tokenExpiresAt,
      },
    }));
  });
}

// Anything that would be due but is already later than the client allows is
// held back and flagged, rather than posting stale content hours late.
export async function expireMissedPublishJobs(db: Database, platform: SocialPlatform, now: Date): Promise<number> {
  return db.transaction(async (tx) => {
    const missed = await dueQuery(tx, platform)
      .where(and(eligible(platform, now), pastLateWindow(now)))
      .for("update", { of: postVariants, skipLocked: true });

    for (const row of missed) {
      const hours = row.lateWindowMinutes / 60;
      const window = Number.isInteger(hours) ? `${hours} hour${hours === 1 ? "" : "s"}` : `${row.lateWindowMinutes} minutes`;
      await tx
        .update(postVariants)
        .set({
          status: "failed",
          publishError: `Held back: it would have gone out more than ${window} after its scheduled time. Retry to publish it now.`,
        })
        .where(eq(postVariants.id, row.id));
      await recordAudit(tx, {
        agencyId: row.agencyId,
        clientId: row.clientId,
        ...PUBLISHER,
        action: "publishing.missed_window",
        objectType: "post_variant",
        objectId: row.id,
      });
      await settlePost(tx, row.postId, PUBLISHER);
    }
    return missed.length;
  });
}

// A claim that never came back (the function was killed mid-call) is failed,
// never retried: the platform may already have published it, and posting the
// same thing twice on a client's page is worse than asking a person to check.
export async function recoverStalePublishJobs(db: Database, platform: SocialPlatform, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000);

  return db.transaction(async (tx) => {
    const stale = await tx
      .update(postVariants)
      .set({
        status: "failed",
        claimedAt: null,
        publishError:
          "Publishing was interrupted before the result came back. Check the page to see whether the post went out, and retry only if it did not.",
      })
      .where(
        and(eq(postVariants.platform, platform), eq(postVariants.status, "queued"), lt(postVariants.claimedAt, cutoff)),
      )
      .returning({ id: postVariants.id, postId: postVariants.postId, agencyId: postVariants.agencyId, clientId: postVariants.clientId });

    for (const row of stale) {
      await recordAudit(tx, {
        agencyId: row.agencyId,
        clientId: row.clientId,
        ...PUBLISHER,
        action: "publishing.interrupted",
        objectType: "post_variant",
        objectId: row.id,
      });
      await settlePost(tx, row.postId, PUBLISHER);
    }
    return stale.length;
  });
}

export async function recordPublishSuccess(
  db: Database,
  variantId: string,
  result: { externalPostId: string | null; url: string | null; at: Date },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(postVariants)
      .set({
        status: "published",
        publishedAt: result.at,
        publishedUrl: result.url,
        externalPostId: result.externalPostId,
        publishError: null,
        claimedAt: null,
      })
      .where(and(eq(postVariants.id, variantId), eq(postVariants.status, "queued")))
      .returning({ postId: postVariants.postId, agencyId: postVariants.agencyId, clientId: postVariants.clientId });
    if (!row) return;

    await recordAudit(tx, {
      agencyId: row.agencyId,
      clientId: row.clientId,
      ...PUBLISHER,
      action: "publishing.published",
      objectType: "post_variant",
      objectId: variantId,
      after: { externalPostId: result.externalPostId },
    });
    await settlePost(tx, row.postId, PUBLISHER);
  });
}

export async function recordPublishFailure(
  db: Database,
  variantId: string,
  failure: { message: string; retryable: boolean },
): Promise<"retrying" | "failed" | "gone"> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ attempts: postVariants.publishAttempts })
      .from(postVariants)
      .where(and(eq(postVariants.id, variantId), eq(postVariants.status, "queued")))
      .limit(1);
    if (!current) return "gone";

    const retry = failure.retryable && current.attempts < MAX_PUBLISH_ATTEMPTS;
    const [row] = await tx
      .update(postVariants)
      .set({ status: retry ? "ready" : "failed", claimedAt: null, publishError: failure.message.slice(0, 500) })
      .where(eq(postVariants.id, variantId))
      .returning({ postId: postVariants.postId, agencyId: postVariants.agencyId, clientId: postVariants.clientId });
    if (!row) return "gone";

    await recordAudit(tx, {
      agencyId: row.agencyId,
      clientId: row.clientId,
      ...PUBLISHER,
      action: retry ? "publishing.retry_scheduled" : "publishing.failed",
      objectType: "post_variant",
      objectId: variantId,
      after: { message: failure.message.slice(0, 500), attempts: current.attempts },
    });
    await settlePost(tx, row.postId, PUBLISHER);
    return retry ? "retrying" : "failed";
  });
}

// The token stopped working, so the account is flagged for someone to reconnect.
export async function flagAccountForReconnect(db: Database, accountId: string, note: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(socialAccounts)
      .set({ health: "needs_attention", healthNote: note.slice(0, 500) })
      .where(eq(socialAccounts.id, accountId))
      .returning({ agencyId: socialAccounts.agencyId, clientId: socialAccounts.clientId });
    if (!row) return;

    await recordAudit(tx, {
      ...row,
      ...PUBLISHER,
      action: "accounts.needs_attention",
      objectType: "social_account",
      objectId: accountId,
      after: { note: note.slice(0, 500) },
    });
  });
}

export interface RefreshableAccount {
  id: string;
  clientId: string;
  externalAccountId: string;
  accessTokenEncrypted: string;
}

// Connected accounts whose token is still valid but needs renewing soon.
// Threads long-lived tokens expire after 60 days, unlike LinkedIn's
// fixed-length ones or Facebook's Page tokens, which never expire. A token
// that has already expired is excluded: refreshing it would only fail, and
// the normal publish-failure path already flags it for reconnecting.
export async function listAccountsNeedingTokenRefresh(
  db: Database,
  platform: SocialPlatform,
  now: Date,
  before: Date,
): Promise<RefreshableAccount[]> {
  const rows = await db
    .select({
      id: socialAccounts.id,
      clientId: socialAccounts.clientId,
      externalAccountId: socialAccounts.externalAccountId,
      accessTokenEncrypted: socialAccounts.accessTokenEncrypted,
    })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.platform, platform),
        eq(socialAccounts.connectionMode, "automatic"),
        ne(socialAccounts.health, "disconnected"),
        isNotNull(socialAccounts.accessTokenEncrypted),
        isNotNull(socialAccounts.tokenExpiresAt),
        gte(socialAccounts.tokenExpiresAt, now),
        lt(socialAccounts.tokenExpiresAt, before),
      ),
    );
  return rows.filter(
    (row): row is RefreshableAccount => row.externalAccountId !== null && row.accessTokenEncrypted !== null,
  );
}

export async function recordTokenRefresh(
  db: Database,
  accountId: string,
  update: { accessTokenEncrypted: string; tokenExpiresAt: Date | null },
): Promise<void> {
  await db.update(socialAccounts).set(update).where(eq(socialAccounts.id, accountId));
}

// ---------- Used by people on the post page ----------

async function lockVariant(tx: Database, scope: ClientScope, postId: string, platform: SocialPlatform) {
  const [variant] = await tx
    .select({ id: postVariants.id, status: postVariants.status })
    .from(postVariants)
    .where(
      and(eq(postVariants.clientId, scope.clientId), eq(postVariants.postId, postId), eq(postVariants.platform, platform)),
    )
    .limit(1)
    .for("update");
  if (!variant) throw new NotFoundError("Platform version");
  if (variant.status === "queued") {
    throw new InvalidInputError("This version is being published right now. Wait a minute and refresh.");
  }
  return variant;
}

function userAudit(scope: ClientScope) {
  return { agencyId: scope.agencyId, clientId: scope.clientId, actorType: "user" as const, actorId: scope.actor.userId };
}

function cleanPostUrl(url: string | null | undefined): string | null {
  const value = url?.trim() || null;
  if (value && !/^https?:\/\/\S+$/i.test(value)) {
    throw new InvalidInputError("The post link needs to start with http:// or https://");
  }
  return value;
}

// For posts that went out by hand: records that it happened, and where.
export async function markVariantPublished(
  db: Database,
  actor: Actor,
  clientId: string,
  postId: string,
  platform: SocialPlatform,
  input: { url?: string | null },
): Promise<void> {
  const scope = await requireClientAccess(db, actor, "post.publishNow", clientId);
  const url = cleanPostUrl(input.url);

  await db.transaction(async (tx) => {
    const variant = await lockVariant(tx, scope, postId, platform);
    if (variant.status === "published") throw new InvalidInputError("This version is already marked as published.");

    await tx
      .update(postVariants)
      .set({ status: "published", publishedAt: new Date(), publishedUrl: url, publishError: null, claimedAt: null })
      .where(eq(postVariants.id, variant.id));

    await recordAudit(tx, {
      ...userAudit(scope),
      action: "publishing.marked_published",
      objectType: "post_variant",
      objectId: variant.id,
      after: { platform, url },
    });
    await settlePost(tx, postId, { actorType: "user", actorId: actor.userId });
  });
}

export async function skipVariant(
  db: Database,
  actor: Actor,
  clientId: string,
  postId: string,
  platform: SocialPlatform,
): Promise<void> {
  const scope = await requireClientAccess(db, actor, "post.publishNow", clientId);

  await db.transaction(async (tx) => {
    const variant = await lockVariant(tx, scope, postId, platform);
    if (variant.status === "published") throw new InvalidInputError("This version is already published.");
    if (variant.status === "skipped") return;

    await tx
      .update(postVariants)
      .set({ status: "skipped", publishError: null, claimedAt: null })
      .where(eq(postVariants.id, variant.id));

    await recordAudit(tx, {
      ...userAudit(scope),
      action: "publishing.skipped",
      objectType: "post_variant",
      objectId: variant.id,
      after: { platform },
    });
    await settlePost(tx, postId, { actorType: "user", actorId: actor.userId });
  });
}

// Puts a failed version back in line and makes the post due now, so the next
// publisher run picks it up inside the late window.
export async function retryVariant(
  db: Database,
  actor: Actor,
  clientId: string,
  postId: string,
  platform: SocialPlatform,
  now: Date = new Date(),
): Promise<void> {
  const scope = await requireClientAccess(db, actor, "post.publishNow", clientId);

  await db.transaction(async (tx) => {
    const variant = await lockVariant(tx, scope, postId, platform);
    if (variant.status !== "failed") throw new InvalidInputError("Only a version that failed can be retried.");

    const [post] = await tx
      .select({ status: posts.status })
      .from(posts)
      .where(and(eq(posts.clientId, scope.clientId), eq(posts.id, postId)))
      .limit(1);
    if (!post) throw new NotFoundError("Post");
    if (post.status === "archived") throw new InvalidInputError("This post is archived. Restore it before retrying.");

    await tx
      .update(postVariants)
      .set({ status: "ready", publishError: null, publishAttempts: 0, claimedAt: null })
      .where(eq(postVariants.id, variant.id));
    await tx
      .update(posts)
      .set({ scheduledAt: now, status: "scheduled" })
      .where(and(eq(posts.clientId, scope.clientId), eq(posts.id, postId)));

    await recordAudit(tx, {
      ...userAudit(scope),
      action: "publishing.retry_requested",
      objectType: "post_variant",
      objectId: variant.id,
      after: { platform, scheduledAt: now.toISOString() },
    });
    await settlePost(tx, postId, { actorType: "user", actorId: actor.userId });
  });
}
