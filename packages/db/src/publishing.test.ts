import { ForbiddenError, InvalidInputError, type SocialPlatform } from "@sp/core";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveOAuthConnection } from "./accounts";
import type { Database } from "./client";
import { setClientPublishingPaused } from "./clients";
import { createPost, saveVariant, setPostSchedule } from "./content";
import {
  MAX_PUBLISH_ATTEMPTS,
  claimDuePublishJobs,
  expireMissedPublishJobs,
  flagAccountForReconnect,
  listAccountsNeedingTokenRefresh,
  markVariantPublished,
  recordPublishFailure,
  recordPublishSuccess,
  recordTokenRefresh,
  recoverStalePublishJobs,
  retryVariant,
  skipVariant,
} from "./publishing";
import { agencies, postVariants, posts, socialAccounts } from "./schema";
import { createTestDatabase, seedTenancy, type TenancyFixture } from "./testing";

let db: Database;
let close: () => Promise<void>;
let f: TenancyFixture;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  f = await seedTenancy(db);
});

afterEach(async () => {
  await close();
});

const AT = new Date("2026-10-01T04:00:00Z");
const minutes = (n: number) => new Date(AT.getTime() + n * 60_000);

async function connectLinkedIn(clientId: string) {
  return saveOAuthConnection(db, f.actors.admin, clientId, "linkedin", {
    displayName: "Kaveri Industrial Labels",
    externalAccountId: "urn:li:organization:42",
    accessTokenEncrypted: "iv:tag:data",
    refreshTokenEncrypted: null,
    tokenExpiresAt: new Date("2027-01-01T00:00:00Z"),
    grantedScopes: ["w_organization_social", "rw_organization_admin"],
  });
}

async function scheduledPost(
  clientId: string,
  options: { at?: Date; platforms?: SocialPlatform[]; hasMedia?: boolean } = {},
) {
  const post = await createPost(db, f.actors.admin, clientId, { title: "Cold storage labels", category: "educational" });
  for (const platform of options.platforms ?? ["linkedin"]) {
    await saveVariant(db, f.actors.admin, clientId, post.id, platform, {
      caption: "Three ways thermal labels survive cold storage",
      hashtags: ["packaging"],
      hasMedia: options.hasMedia ?? false,
    });
  }
  await setPostSchedule(db, f.actors.admin, clientId, post.id, options.at ?? AT);
  return post;
}

async function variant(postId: string, platform: SocialPlatform = "linkedin") {
  const rows = await db.select().from(postVariants).where(eq(postVariants.postId, postId));
  const row = rows.find((r) => r.platform === platform);
  if (!row) throw new Error("variant missing");
  return row;
}

async function postStatus(postId: string) {
  const [row] = await db.select({ status: posts.status, scheduledAt: posts.scheduledAt, publishedAt: posts.publishedAt }).from(posts).where(eq(posts.id, postId));
  return row!;
}

describe("claiming due LinkedIn versions", () => {
  it("claims a due version once, with what the publisher needs", async () => {
    await connectLinkedIn(f.clients.kaveri.id);
    const post = await scheduledPost(f.clients.kaveri.id);

    const jobs = await claimDuePublishJobs(db, "linkedin", minutes(1), 10);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      postId: post.id,
      caption: "Three ways thermal labels survive cold storage",
      hashtags: ["packaging"],
      attempt: 1,
      account: { externalAccountId: "urn:li:organization:42", accessTokenEncrypted: "iv:tag:data" },
    });
    expect((await variant(post.id)).status).toBe("queued");

    // A second run straight after must not take the same version again.
    expect(await claimDuePublishJobs(db, "linkedin", minutes(2), 10)).toEqual([]);
  });

  it("leaves alone anything that is not due or not allowed to post on its own", async () => {
    await scheduledPost(f.clients.kaveri.id);
    // Not connected: an assisted account never posts automatically.
    expect(await claimDuePublishJobs(db, "linkedin", minutes(1), 10)).toEqual([]);

    await connectLinkedIn(f.clients.kaveri.id);
    // Not due yet.
    expect(await claimDuePublishJobs(db, "linkedin", minutes(-1), 10)).toEqual([]);

    // Paused client.
    await setClientPublishingPaused(db, f.actors.admin, f.clients.kaveri.id, true);
    expect(await claimDuePublishJobs(db, "linkedin", minutes(1), 10)).toEqual([]);
    await setClientPublishingPaused(db, f.actors.admin, f.clients.kaveri.id, false);

    // Paused agency.
    await db.update(agencies).set({ publishingPausedAt: new Date() }).where(eq(agencies.id, f.agency.id));
    expect(await claimDuePublishJobs(db, "linkedin", minutes(1), 10)).toEqual([]);
    await db.update(agencies).set({ publishingPausedAt: null }).where(eq(agencies.id, f.agency.id));

    // Disconnected account.
    await db.update(socialAccounts).set({ health: "disconnected" });
    expect(await claimDuePublishJobs(db, "linkedin", minutes(1), 10)).toEqual([]);
    await db.update(socialAccounts).set({ health: "ok" });

    // Only LinkedIn is asked for, so the Facebook version is untouched.
    expect(await claimDuePublishJobs(db, "facebook", minutes(1), 10)).toEqual([]);

    // With every block lifted, the post is finally taken.
    expect(await claimDuePublishJobs(db, "linkedin", minutes(1), 10)).toHaveLength(1);
  });

  it("never posts a version that has media, since the image is not in the app", async () => {
    await connectLinkedIn(f.clients.kaveri.id);
    const post = await scheduledPost(f.clients.kaveri.id, { hasMedia: true });
    expect(await claimDuePublishJobs(db, "linkedin", minutes(1), 10)).toEqual([]);
    expect((await variant(post.id)).status).toBe("ready");
  });
});

describe("recording results", () => {
  it("marks the version and the post published when LinkedIn accepts it", async () => {
    await connectLinkedIn(f.clients.kaveri.id);
    const post = await scheduledPost(f.clients.kaveri.id);
    const [job] = await claimDuePublishJobs(db, "linkedin", minutes(1), 10);

    await recordPublishSuccess(db, job!.variantId, {
      externalPostId: "urn:li:share:1",
      url: "https://www.linkedin.com/feed/update/urn:li:share:1/",
      at: minutes(1),
    });

    const v = await variant(post.id);
    expect(v).toMatchObject({ status: "published", externalPostId: "urn:li:share:1", publishError: null, claimedAt: null });
    expect(await postStatus(post.id)).toMatchObject({ status: "published", publishedAt: minutes(1) });
  });

  it("keeps the post scheduled until the versions posted by hand are done too", async () => {
    await connectLinkedIn(f.clients.kaveri.id);
    const post = await scheduledPost(f.clients.kaveri.id, { platforms: ["linkedin", "facebook"] });
    const [job] = await claimDuePublishJobs(db, "linkedin", minutes(1), 10);
    await recordPublishSuccess(db, job!.variantId, { externalPostId: "urn:li:share:2", url: "https://x.test/", at: minutes(1) });

    expect((await postStatus(post.id)).status).toBe("scheduled");

    await markVariantPublished(db, f.actors.manager, f.clients.kaveri.id, post.id, "facebook", {
      url: "https://facebook.com/kaveri/posts/1",
    });
    expect((await variant(post.id, "facebook")).publishedUrl).toBe("https://facebook.com/kaveri/posts/1");
    expect((await postStatus(post.id)).status).toBe("published");
  });

  it("retries a temporary failure, then gives up and flags the post", async () => {
    await connectLinkedIn(f.clients.kaveri.id);
    const post = await scheduledPost(f.clients.kaveri.id);

    for (let attempt = 1; attempt < MAX_PUBLISH_ATTEMPTS; attempt++) {
      const [job] = await claimDuePublishJobs(db, "linkedin", minutes(attempt), 10);
      expect(job!.attempt).toBe(attempt);
      expect(await recordPublishFailure(db, job!.variantId, { message: "Rate limited", retryable: true })).toBe("retrying");
      expect((await variant(post.id)).status).toBe("ready");
      expect((await postStatus(post.id)).status).toBe("scheduled");
    }

    const [last] = await claimDuePublishJobs(db, "linkedin", minutes(10), 10);
    expect(await recordPublishFailure(db, last!.variantId, { message: "Rate limited", retryable: true })).toBe("failed");
    expect((await variant(post.id)).publishError).toBe("Rate limited");
    expect((await postStatus(post.id)).status).toBe("failed");
  });

  it("fails straight away on an error that would repeat", async () => {
    await connectLinkedIn(f.clients.kaveri.id);
    const post = await scheduledPost(f.clients.kaveri.id);
    const [job] = await claimDuePublishJobs(db, "linkedin", minutes(1), 10);
    expect(await recordPublishFailure(db, job!.variantId, { message: "Caption too long", retryable: false })).toBe("failed");
    expect((await postStatus(post.id)).status).toBe("failed");
  });

  it("flags the account when its access stops working", async () => {
    const account = await connectLinkedIn(f.clients.kaveri.id);
    await flagAccountForReconnect(db, account.id, "Reconnect LinkedIn");
    const [row] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, account.id));
    expect(row).toMatchObject({ health: "needs_attention", healthNote: "Reconnect LinkedIn" });
  });
});

describe("safety nets", () => {
  it("holds back a post that is later than the client's late window", async () => {
    await connectLinkedIn(f.clients.kaveri.id);
    const post = await scheduledPost(f.clients.kaveri.id);

    // The default window is three hours.
    const now = minutes(181);
    expect(await expireMissedPublishJobs(db, "linkedin", now)).toBe(1);
    expect(await claimDuePublishJobs(db, "linkedin", now, 10)).toEqual([]);

    const v = await variant(post.id);
    expect(v.status).toBe("failed");
    expect(v.publishError).toMatch(/more than 3 hours after its scheduled time/);
    expect((await postStatus(post.id)).status).toBe("failed");
  });

  it("fails an interrupted publish instead of posting it twice", async () => {
    await connectLinkedIn(f.clients.kaveri.id);
    const post = await scheduledPost(f.clients.kaveri.id);
    await claimDuePublishJobs(db, "linkedin", minutes(1), 10);

    expect(await recoverStalePublishJobs(db, "linkedin", minutes(5))).toBe(0);
    expect(await recoverStalePublishJobs(db, "linkedin", minutes(20))).toBe(1);

    const v = await variant(post.id);
    expect(v.status).toBe("failed");
    expect(v.publishError).toMatch(/Check the page/);
    expect(await claimDuePublishJobs(db, "linkedin", minutes(21), 10)).toEqual([]);
  });

  it("refuses to edit or remove a version that is live or mid-publish", async () => {
    await connectLinkedIn(f.clients.kaveri.id);
    const post = await scheduledPost(f.clients.kaveri.id);
    const [job] = await claimDuePublishJobs(db, "linkedin", minutes(1), 10);

    const edit = () =>
      saveVariant(db, f.actors.admin, f.clients.kaveri.id, post.id, "linkedin", { caption: "Changed" });
    await expect(edit()).rejects.toThrow(/being published right now/);

    await recordPublishSuccess(db, job!.variantId, { externalPostId: "urn:li:share:3", url: "https://x.test/", at: minutes(1) });
    await expect(edit()).rejects.toThrow(/already published/);
  });
});

describe("what people can do on the post page", () => {
  it("lets a failed version be retried now, back inside the late window", async () => {
    await connectLinkedIn(f.clients.kaveri.id);
    const post = await scheduledPost(f.clients.kaveri.id);
    await expireMissedPublishJobs(db, "linkedin", minutes(200));

    const retryAt = minutes(300);
    await retryVariant(db, f.actors.manager, f.clients.kaveri.id, post.id, "linkedin", retryAt);

    expect(await variant(post.id)).toMatchObject({ status: "ready", publishError: null, publishAttempts: 0 });
    expect(await postStatus(post.id)).toMatchObject({ status: "scheduled", scheduledAt: retryAt });
    expect(await claimDuePublishJobs(db, "linkedin", minutes(301), 10)).toHaveLength(1);
  });

  it("only retries versions that actually failed", async () => {
    const post = await scheduledPost(f.clients.kaveri.id);
    await expect(
      retryVariant(db, f.actors.manager, f.clients.kaveri.id, post.id, "linkedin"),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("skipping every other version lets the post finish as published", async () => {
    const post = await scheduledPost(f.clients.kaveri.id, { platforms: ["linkedin", "x"] });
    await skipVariant(db, f.actors.manager, f.clients.kaveri.id, post.id, "x");
    expect((await postStatus(post.id)).status).toBe("scheduled");

    await markVariantPublished(db, f.actors.manager, f.clients.kaveri.id, post.id, "linkedin", {});
    expect((await postStatus(post.id)).status).toBe("published");
  });

  it("checks the post link and who is allowed to mark things published", async () => {
    const post = await scheduledPost(f.clients.kaveri.id);
    await expect(
      markVariantPublished(db, f.actors.manager, f.clients.kaveri.id, post.id, "linkedin", { url: "linkedin.com/x" }),
    ).rejects.toThrow(/http/);
    await expect(
      markVariantPublished(db, f.actors.writer, f.clients.kaveri.id, post.id, "linkedin", {}),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      markVariantPublished(db, f.actors.outsider, f.clients.kaveri.id, post.id, "linkedin", {}),
    ).rejects.toThrow();
  });
});

describe("listAccountsNeedingTokenRefresh", () => {
  async function connectThreads(clientId: string, tokenExpiresAt: Date | null) {
    return saveOAuthConnection(db, f.actors.admin, clientId, "threads", {
      displayName: "@kaveri_labels",
      externalAccountId: "789",
      accessTokenEncrypted: "iv:tag:data",
      refreshTokenEncrypted: null,
      tokenExpiresAt,
      grantedScopes: ["threads_basic", "threads_content_publish"],
    });
  }

  it("finds a connected account whose token expires before the cutoff", async () => {
    await connectThreads(f.clients.kaveri.id, minutes(60 * 24));
    const due = await listAccountsNeedingTokenRefresh(db, "threads", AT, minutes(60 * 24 * 2));
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ clientId: f.clients.kaveri.id, externalAccountId: "789", accessTokenEncrypted: "iv:tag:data" });
  });

  it("leaves alone tokens that are not close to expiring, other platforms, and disconnected accounts", async () => {
    await connectThreads(f.clients.kaveri.id, minutes(60 * 24 * 90));
    await connectLinkedIn(f.clients.northwind.id);
    expect(await listAccountsNeedingTokenRefresh(db, "threads", AT, minutes(60 * 24 * 2))).toEqual([]);

    const expiring = await connectThreads(f.clients.northwind.id, minutes(60 * 24));
    await db.update(socialAccounts).set({ health: "disconnected" }).where(eq(socialAccounts.id, expiring.id));
    expect(await listAccountsNeedingTokenRefresh(db, "threads", AT, minutes(60 * 24 * 2))).toEqual([]);
  });

  it("excludes a token that has already expired, since refreshing it would only fail", async () => {
    await connectThreads(f.clients.kaveri.id, minutes(-1));
    expect(await listAccountsNeedingTokenRefresh(db, "threads", AT, minutes(60 * 24 * 2))).toEqual([]);
  });

  it("does not consider a token that never expires, like a Facebook Page token", async () => {
    await saveOAuthConnection(db, f.actors.admin, f.clients.kaveri.id, "facebook", {
      displayName: "Kaveri Industrial Labels",
      externalAccountId: "555",
      accessTokenEncrypted: "iv:tag:data",
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      grantedScopes: ["pages_manage_posts"],
    });
    expect(await listAccountsNeedingTokenRefresh(db, "facebook", AT, minutes(60 * 24 * 365))).toEqual([]);
  });
});

describe("recordTokenRefresh", () => {
  it("stores the new token and expiry without touching anything else", async () => {
    const account = await saveOAuthConnection(db, f.actors.admin, f.clients.kaveri.id, "threads", {
      displayName: "@kaveri_labels",
      externalAccountId: "789",
      accessTokenEncrypted: "iv:tag:old",
      refreshTokenEncrypted: null,
      tokenExpiresAt: minutes(1),
      grantedScopes: ["threads_basic"],
    });

    await recordTokenRefresh(db, account.id, { accessTokenEncrypted: "iv:tag:new", tokenExpiresAt: minutes(60 * 24 * 60) });

    const row = (await db.select().from(socialAccounts)).find((r) => r.id === account.id);
    expect(row).toMatchObject({
      accessTokenEncrypted: "iv:tag:new",
      tokenExpiresAt: minutes(60 * 24 * 60),
      displayName: "@kaveri_labels",
      health: "ok",
    });
  });
});
