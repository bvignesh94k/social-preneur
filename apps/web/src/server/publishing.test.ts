import { createPost, saveOAuthConnection, saveVariant, setPostSchedule, type Database } from "@sp/db";
import { postVariants, posts, socialAccounts } from "@sp/db/schema";
import { createTestDatabase, seedTenancy, type TenancyFixture } from "@sp/db/testing";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encryptToken } from "./oauth/token-crypto";
import { appSecretProof } from "./oauth/meta";
import { runFacebookPublishing, runLinkedInPublishing, runThreadsPublishing } from "./publishing";

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

describe("runFacebookPublishing", () => {
  const APP_SECRET = "app-secret";

  async function setUpFacebook(link: string | null = "https://kaveri.test/guide") {
    const account = await saveOAuthConnection(db, f.actors.admin, f.clients.kaveri.id, "facebook", {
      displayName: "Kaveri Industrial Labels",
      externalAccountId: "555",
      accessTokenEncrypted: encryptToken("page-token", KEY),
      refreshTokenEncrypted: null,
      // Page tokens do not expire.
      tokenExpiresAt: null,
      grantedScopes: ["pages_manage_posts"],
    });
    const post = await createPost(db, f.actors.admin, f.clients.kaveri.id, { title: "Labels", category: "educational" });
    await saveVariant(db, f.actors.admin, f.clients.kaveri.id, post.id, "facebook", {
      caption: "Labels that survive (cold) storage",
      hashtags: ["packaging"],
      linkUrl: link,
    });
    await setPostSchedule(db, f.actors.admin, f.clients.kaveri.id, post.id, AT);
    return { account, post };
  }

  const run = (fetch: (url: string, init?: RequestInit) => Promise<Response>) =>
    runFacebookPublishing(db, { encryptionKey: KEY, appSecret: APP_SECRET, now: NOW, fetch });

  const graphError = (code: number) =>
    new Response(JSON.stringify({ error: { message: `Graph error ${code}`, code } }), { status: 400 });

  it("posts to the Page feed with the Page token and records the link", async () => {
    const { post } = await setUpFacebook();
    const facebook = fakeLinkedIn(() => new Response(JSON.stringify({ id: "555_777" }), { status: 200 }));

    const summary = await run(facebook.fetch);

    expect(summary).toMatchObject({ claimed: 1, published: 1, failed: 0 });
    expect(facebook.calls[0]!.url).toMatch(/\/555\/feed$/);
    const body = Object.fromEntries(new URLSearchParams(String(facebook.calls[0]!.init!.body)));
    expect(body).toEqual({
      message: "Labels that survive (cold) storage\n\n#packaging",
      published: "true",
      access_token: "page-token",
      appsecret_proof: appSecretProof("page-token", APP_SECRET),
      link: "https://kaveri.test/guide",
    });
    expect(await linkedInVariant(post.id)).toMatchObject({
      status: "published",
      externalPostId: "555_777",
      publishedUrl: "https://www.facebook.com/555_777",
    });
  });

  it("flags the Page for reconnecting when Facebook rejects the token", async () => {
    const { post, account } = await setUpFacebook();
    await run(fakeLinkedIn(() => graphError(190)).fetch);

    expect((await linkedInVariant(post.id)).publishError).toMatch(/Reconnect Facebook/);
    const row = (await db.select().from(socialAccounts)).find((r) => r.id === account.id);
    expect(row!.health).toBe("needs_attention");
  });

  it("retries a Facebook rate limit but not a duplicate", async () => {
    const { post } = await setUpFacebook();
    expect((await run(fakeLinkedIn(() => graphError(4)).fetch)).retrying).toBe(1);
    expect((await linkedInVariant(post.id)).status).toBe("ready");

    const second = await run(fakeLinkedIn(() => graphError(506)).fetch);
    expect(second).toMatchObject({ failed: 1, retrying: 0 });
    expect((await linkedInVariant(post.id)).publishError).toMatch(/duplicate/);
  });

  it("does not retry when Facebook's answer is unclear", async () => {
    const { post } = await setUpFacebook(null);
    const summary = await run(fakeLinkedIn(() => graphError(2)).fetch);
    expect(summary).toMatchObject({ failed: 1, retrying: 0 });
    expect((await linkedInVariant(post.id)).publishError).toMatch(/not certain the post went out/);
  });
});

describe("runThreadsPublishing", () => {
  function queueFetch(responses: (Response | Promise<Response>)[]) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetch = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error("unexpected call");
      return next;
    };
    return { calls, fetch };
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function setUpThreads(tokenExpiresAt: Date | null = new Date("2027-01-01T00:00:00Z")) {
    const account = await saveOAuthConnection(db, f.actors.admin, f.clients.kaveri.id, "threads", {
      displayName: "@kaveri_labels",
      externalAccountId: "789",
      accessTokenEncrypted: encryptToken("real-token", KEY),
      refreshTokenEncrypted: null,
      tokenExpiresAt,
      grantedScopes: ["threads_basic", "threads_content_publish"],
    });
    const post = await createPost(db, f.actors.admin, f.clients.kaveri.id, { title: "Labels", category: "educational" });
    await saveVariant(db, f.actors.admin, f.clients.kaveri.id, post.id, "threads", {
      caption: "Labels that survive (cold) storage",
      hashtags: ["packaging"],
    });
    await setPostSchedule(db, f.actors.admin, f.clients.kaveri.id, post.id, AT);
    return { account, post };
  }

  const run = (fetch: (url: string, init?: RequestInit) => Promise<Response>) =>
    runThreadsPublishing(db, { encryptionKey: KEY, now: NOW, fetch });

  it("creates the container, waits for it, and publishes with the decrypted token", async () => {
    const { post } = await setUpThreads();
    const threads = queueFetch([
      json({ id: "container_1" }),
      json({ status: "FINISHED" }),
      json({ id: "media_1" }),
      json({ permalink: "https://www.threads.net/@kaveri_labels/post/abcdefg" }),
    ]);

    const summary = await run(threads.fetch);

    expect(summary).toMatchObject({ claimed: 1, published: 1, failed: 0 });
    expect(threads.calls[0]!.url).toBe("https://graph.threads.net/v1.0/789/threads");
    expect(new URLSearchParams(String(threads.calls[0]!.init!.body)).get("text")).toBe(
      "Labels that survive (cold) storage\n\n#packaging",
    );
    expect((threads.calls[0]!.init!.headers as Record<string, string>)["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(await linkedInVariant(post.id)).toMatchObject({
      status: "published",
      externalPostId: "media_1",
      publishedUrl: "https://www.threads.net/@kaveri_labels/post/abcdefg",
    });
  }, 10_000);

  it("flags the profile for reconnecting when Threads rejects the token", async () => {
    const { post, account } = await setUpThreads();
    await run(queueFetch([json({ error: { message: "Invalid OAuth 2.0 Access Token", code: 190 } }, 400)]).fetch);

    expect((await linkedInVariant(post.id)).publishError).toMatch(/Reconnect Threads/);
    const row = (await db.select().from(socialAccounts)).find((r) => r.id === account.id);
    expect(row!.health).toBe("needs_attention");
  });

  it("retries a Threads rate limit", async () => {
    const { post } = await setUpThreads();
    const summary = await run(queueFetch([json({ error: { message: "rate limited", code: 4 } }, 400)]).fetch);
    expect(summary).toMatchObject({ retrying: 1, failed: 0 });
    expect((await linkedInVariant(post.id)).status).toBe("ready");
  });

  it("never calls Threads with an expired connection", async () => {
    const { post } = await setUpThreads(new Date(AT.getTime() - 1));
    const threads = queueFetch([json({ id: "container_1" })]);
    const summary = await run(threads.fetch);
    expect(threads.calls).toHaveLength(0);
    expect(summary.failed).toBe(1);
    expect((await linkedInVariant(post.id)).publishError).toMatch(/expired/);
  });

  it("refreshes a token nearing expiry before publishing, and stores the new one", async () => {
    const { account } = await setUpThreads(new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000));
    const threads = queueFetch([
      json({ access_token: "refreshed-token", expires_in: 5_184_000 }),
      json({ id: "container_1" }),
      json({ status: "FINISHED" }),
      json({ id: "media_1" }),
      json({ permalink: "https://www.threads.net/@kaveri_labels/post/abcdefg" }),
    ]);

    const summary = await run(threads.fetch);

    expect(summary).toMatchObject({ published: 1 });
    expect(threads.calls[0]!.url).toMatch(/refresh_access_token/);
    expect(new URLSearchParams(threads.calls[0]!.url.split("?")[1]).get("access_token")).toBe("real-token");
    // The post itself is created with the newly refreshed token, not the old one.
    const postBody = new URLSearchParams(String(threads.calls[1]!.init!.body));
    expect(postBody.get("access_token")).toBe("refreshed-token");

    // The refresh math uses the real clock, same convention as the other
    // platforms' token exchange, not the publisher's injected `now`.
    const row = (await db.select().from(socialAccounts)).find((r) => r.id === account.id);
    expect(row!.tokenExpiresAt).toBeInstanceOf(Date);
    expect(row!.tokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 55 * 24 * 60 * 60 * 1000);
    expect(row!.accessTokenEncrypted).not.toBe(account.accessTokenEncrypted);
  }, 10_000);

  it("does not refresh a token that still has plenty of time left", async () => {
    await setUpThreads(new Date(NOW.getTime() + 60 * 24 * 60 * 60 * 1000));
    const threads = queueFetch([json({ id: "container_1" }), json({ status: "FINISHED" }), json({ id: "media_1" }), json({ permalink: null })]);
    await run(threads.fetch);
    expect(threads.calls.some((call) => call.url.includes("refresh_access_token"))).toBe(false);
  }, 10_000);
});
