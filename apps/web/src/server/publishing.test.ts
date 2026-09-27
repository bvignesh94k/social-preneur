import { createPost, saveOAuthConnection, saveVariant, setPostSchedule, type Database } from "@sp/db";
import { postVariants, posts, socialAccounts } from "@sp/db/schema";
import { createTestDatabase, seedTenancy, type TenancyFixture } from "@sp/db/testing";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encryptToken } from "./oauth/token-crypto";
import { runLinkedInPublishing } from "./publishing";

const KEY = randomBytes(32).toString("base64");
const AT = new Date("2026-10-01T04:00:00Z");
const NOW = new Date(AT.getTime() + 60_000);

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

async function setUp(options: { tokenExpiresAt?: Date } = {}) {
  const account = await saveOAuthConnection(db, f.actors.admin, f.clients.kaveri.id, "linkedin", {
    displayName: "Kaveri Industrial Labels",
    externalAccountId: "urn:li:organization:42",
    accessTokenEncrypted: encryptToken("real-token", KEY),
    refreshTokenEncrypted: null,
    tokenExpiresAt: options.tokenExpiresAt ?? new Date("2027-01-01T00:00:00Z"),
    grantedScopes: ["w_organization_social", "rw_organization_admin"],
  });
  const post = await createPost(db, f.actors.admin, f.clients.kaveri.id, { title: "Labels", category: "educational" });
  await saveVariant(db, f.actors.admin, f.clients.kaveri.id, post.id, "linkedin", {
    caption: "Labels that survive (cold) storage",
    hashtags: ["packaging"],
  });
  await setPostSchedule(db, f.actors.admin, f.clients.kaveri.id, post.id, AT);
  return { account, post };
}

function fakeLinkedIn(respond: () => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return respond();
  };
  return { calls, fetch };
}

async function linkedInVariant(postId: string) {
  const row = (await db.select().from(postVariants)).find((r) => r.postId === postId);
  return row!;
}

describe("runLinkedInPublishing", () => {
  it("publishes a due post with the decrypted token and records the link", async () => {
    const { post } = await setUp();
    const linkedIn = fakeLinkedIn(() => new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:7" } }));

    const summary = await runLinkedInPublishing(db, { encryptionKey: KEY, now: NOW, fetch: linkedIn.fetch });

    expect(summary).toMatchObject({ claimed: 1, published: 1, failed: 0, retrying: 0 });
    expect(linkedIn.calls).toHaveLength(1);
    expect((linkedIn.calls[0]!.init!.headers as Record<string, string>).authorization).toBe("Bearer real-token");
    expect(JSON.parse(String(linkedIn.calls[0]!.init!.body))).toMatchObject({
      author: "urn:li:organization:42",
      commentary: "Labels that survive \\(cold\\) storage\n\n#packaging",
    });

    expect(await linkedInVariant(post.id)).toMatchObject({
      status: "published",
      externalPostId: "urn:li:share:7",
      publishedUrl: "https://www.linkedin.com/feed/update/urn:li:share:7/",
    });
    const row = (await db.select({ id: posts.id, status: posts.status }).from(posts)).find((r) => r.id === post.id);
    expect(row!.status).toBe("published");

    // Nothing is posted twice on the next run.
    const again = await runLinkedInPublishing(db, { encryptionKey: KEY, now: NOW, fetch: linkedIn.fetch });
    expect(again.claimed).toBe(0);
    expect(linkedIn.calls).toHaveLength(1);
  });

  it("flags the account and fails the post when LinkedIn rejects the token", async () => {
    const { post, account } = await setUp();
    const linkedIn = fakeLinkedIn(() => new Response(JSON.stringify({ message: "Invalid access token" }), { status: 401 }));

    const summary = await runLinkedInPublishing(db, { encryptionKey: KEY, now: NOW, fetch: linkedIn.fetch });

    expect(summary).toMatchObject({ published: 0, failed: 1 });
    expect((await linkedInVariant(post.id)).publishError).toMatch(/Reconnect LinkedIn/);
    const row = (await db.select().from(socialAccounts)).find((r) => r.id === account.id);
    expect(row!.health).toBe("needs_attention");
  });

  it("tries again later when LinkedIn is rate limiting", async () => {
    const { post } = await setUp();
    const linkedIn = fakeLinkedIn(() => new Response("{}", { status: 429 }));

    const summary = await runLinkedInPublishing(db, { encryptionKey: KEY, now: NOW, fetch: linkedIn.fetch });

    expect(summary).toMatchObject({ retrying: 1, failed: 0 });
    expect((await linkedInVariant(post.id)).status).toBe("ready");
  });

  it("does not retry when it is unclear whether the post went out", async () => {
    const { post } = await setUp();
    const linkedIn = fakeLinkedIn(() => {
      throw new TypeError("fetch failed");
    });

    const summary = await runLinkedInPublishing(db, { encryptionKey: KEY, now: NOW, fetch: linkedIn.fetch });

    expect(summary).toMatchObject({ failed: 1, retrying: 0 });
    expect((await linkedInVariant(post.id)).publishError).toMatch(/not certain the post went out/);
  });

  it("never calls LinkedIn with an expired connection", async () => {
    const { post } = await setUp({ tokenExpiresAt: new Date(AT.getTime() - 1) });
    const linkedIn = fakeLinkedIn(() => new Response(null, { status: 201 }));

    const summary = await runLinkedInPublishing(db, { encryptionKey: KEY, now: NOW, fetch: linkedIn.fetch });

    expect(linkedIn.calls).toHaveLength(0);
    expect(summary.failed).toBe(1);
    expect((await linkedInVariant(post.id)).publishError).toMatch(/expired/);
  });

  it("fails safely when the stored token cannot be decrypted", async () => {
    const { post } = await setUp();
    const linkedIn = fakeLinkedIn(() => new Response(null, { status: 201 }));

    await runLinkedInPublishing(db, { encryptionKey: randomBytes(32).toString("base64"), now: NOW, fetch: linkedIn.fetch });

    expect(linkedIn.calls).toHaveLength(0);
    expect((await linkedInVariant(post.id)).publishError).toMatch(/could not be read/);
  });
});
