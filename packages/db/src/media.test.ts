import { ForbiddenError, InvalidInputError, MAX_MEDIA_PER_POST, NotFoundError, type SocialPlatform } from "@sp/core";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveOAuthConnection } from "./accounts";
import type { Database } from "./client";
import {
  addPostMedia,
  createPost,
  duplicatePost,
  getPost,
  removePostMedia,
  saveVariant,
  setPostSchedule,
  type MediaInput,
} from "./content";
import { claimDuePublishJobs, recordPublishSuccess } from "./publishing";
import { postVariants } from "./schema";
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
const soon = new Date(AT.getTime() + 60_000);

const image = (name = "label.jpg"): MediaInput => ({
  kind: "image",
  url: `https://store.public.blob.vercel-storage.com/clients/k/${name}`,
  pathname: `clients/k/${name}`,
  contentType: "image/jpeg",
  sizeBytes: 120_000,
  width: 1080,
  height: 1080,
  fileName: name,
});

const video: MediaInput = { ...image("reel.mp4"), kind: "video", contentType: "video/mp4" };

async function draft(platforms: SocialPlatform[] = []) {
  const post = await createPost(db, f.actors.admin, f.clients.kaveri.id, { title: "Freezer labels", category: "educational" });
  for (const platform of platforms) {
    await saveVariant(db, f.actors.admin, f.clients.kaveri.id, post.id, platform, { caption: "Labels that survive -30C" });
  }
  return post;
}

async function variantStatus(postId: string, platform: SocialPlatform) {
  const rows = await db.select().from(postVariants).where(eq(postVariants.postId, postId));
  return rows.find((row) => row.platform === platform)!;
}

async function connect(platform: SocialPlatform) {
  await saveOAuthConnection(db, f.actors.admin, f.clients.kaveri.id, platform, {
    displayName: "Kaveri",
    externalAccountId: `${platform}-account`,
    accessTokenEncrypted: "iv:tag:data",
    refreshTokenEncrypted: null,
    tokenExpiresAt: null,
    grantedScopes: [],
  });
}

describe("attaching media to a post", () => {
  it("adds images in order and reads them back with the post", async () => {
    const post = await draft();
    await addPostMedia(db, f.actors.writer, f.clients.kaveri.id, post.id, image("one.jpg"));
    await addPostMedia(db, f.actors.writer, f.clients.kaveri.id, post.id, image("two.jpg"));

    const scope = { clientId: f.clients.kaveri.id } as Parameters<typeof getPost>[1];
    const read = await getPost(db, scope, post.id);
    expect(read.media.map((item) => item.fileName)).toEqual(["one.jpg", "two.jpg"]);
    expect(read.media.map((item) => item.position)).toEqual([0, 1]);
  });

  it("turns an Instagram version ready once an image is added, and back when it is removed", async () => {
    const post = await draft(["instagram", "linkedin"]);
    expect((await variantStatus(post.id, "instagram")).status).toBe("pending");

    const added = await addPostMedia(db, f.actors.admin, f.clients.kaveri.id, post.id, image());
    const instagram = await variantStatus(post.id, "instagram");
    expect(instagram.status).toBe("ready");
    expect(instagram.hasMedia).toBe(true);
    expect((await variantStatus(post.id, "linkedin")).hasMedia).toBe(true);

    const removed = await removePostMedia(db, f.actors.admin, f.clients.kaveri.id, post.id, added.id);
    expect(removed.stillUsed).toBe(false);
    expect((await variantStatus(post.id, "instagram")).status).toBe("pending");
  });

  it("counts uploaded media when a version is saved later", async () => {
    const post = await draft();
    await addPostMedia(db, f.actors.admin, f.clients.kaveri.id, post.id, image());
    await saveVariant(db, f.actors.admin, f.clients.kaveri.id, post.id, "instagram", { caption: "Cold proof" });
    expect((await variantStatus(post.id, "instagram")).status).toBe("ready");
  });

  it("caps how many files one post can carry", async () => {
    const post = await draft();
    for (let i = 0; i < MAX_MEDIA_PER_POST; i++) {
      await addPostMedia(db, f.actors.admin, f.clients.kaveri.id, post.id, image(`${i}.jpg`));
    }
    await expect(addPostMedia(db, f.actors.admin, f.clients.kaveri.id, post.id, image("extra.jpg"))).rejects.toThrow(
      InvalidInputError,
    );
  });

  it("refuses a change while a version is being published", async () => {
    await connect("facebook");
    const post = await draft(["facebook"]);
    await setPostSchedule(db, f.actors.admin, f.clients.kaveri.id, post.id, AT);
    expect(await claimDuePublishJobs(db, "facebook", soon, 10)).toHaveLength(1);

    await expect(addPostMedia(db, f.actors.admin, f.clients.kaveri.id, post.id, image())).rejects.toThrow(
      /being published/,
    );
  });

  it("keeps people without edit rights and other clients out", async () => {
    const post = await draft();
    await expect(addPostMedia(db, f.actors.viewer, f.clients.kaveri.id, post.id, image())).rejects.toThrow(
      ForbiddenError,
    );
    const northwind = await createPost(db, f.actors.admin, f.clients.northwind.id, { title: "Other", category: "news" });
    await expect(addPostMedia(db, f.actors.admin, f.clients.kaveri.id, northwind.id, image())).rejects.toThrow(
      NotFoundError,
    );
  });

  it("shares files with a duplicate, so removing from one keeps the file for the other", async () => {
    const post = await draft();
    const added = await addPostMedia(db, f.actors.admin, f.clients.kaveri.id, post.id, image());
    const copy = await duplicatePost(db, f.actors.admin, f.clients.kaveri.id, post.id, null);

    const scope = { clientId: f.clients.kaveri.id } as Parameters<typeof getPost>[1];
    expect((await getPost(db, scope, copy.id)).media).toHaveLength(1);

    const removed = await removePostMedia(db, f.actors.admin, f.clients.kaveri.id, post.id, added.id);
    expect(removed.stillUsed).toBe(true);
  });
});

describe("publishing posts that have media", () => {
  async function scheduled(platforms: SocialPlatform[], media: MediaInput[]) {
    const post = await draft(platforms);
    for (const item of media) await addPostMedia(db, f.actors.admin, f.clients.kaveri.id, post.id, item);
    await setPostSchedule(db, f.actors.admin, f.clients.kaveri.id, post.id, AT);
    return post;
  }

  it("hands a single image to Facebook and Threads along with the job", async () => {
    await connect("facebook");
    await connect("threads");
    await scheduled(["facebook", "threads"], [image()]);

    const facebook = await claimDuePublishJobs(db, "facebook", soon, 10);
    expect(facebook).toHaveLength(1);
    expect(facebook[0]!.media).toEqual([{ url: image().url, kind: "image", contentType: "image/jpeg" }]);
    expect(await claimDuePublishJobs(db, "threads", soon, 10)).toHaveLength(1);
  });

  it("leaves video, several images, and LinkedIn images for a person", async () => {
    await connect("facebook");
    await connect("linkedin");
    await scheduled(["facebook"], [video]);
    await scheduled(["facebook"], [image("a.jpg"), image("b.jpg")]);
    await scheduled(["linkedin"], [image()]);

    expect(await claimDuePublishJobs(db, "facebook", soon, 10)).toEqual([]);
    expect(await claimDuePublishJobs(db, "linkedin", soon, 10)).toEqual([]);
  });

  it("still leaves creative that lives outside the app for a person", async () => {
    await connect("facebook");
    const post = await createPost(db, f.actors.admin, f.clients.kaveri.id, { title: "Outside", category: "news" });
    await saveVariant(db, f.actors.admin, f.clients.kaveri.id, post.id, "facebook", { caption: "Hi", hasMedia: true });
    await setPostSchedule(db, f.actors.admin, f.clients.kaveri.id, post.id, AT);

    expect(await claimDuePublishJobs(db, "facebook", soon, 10)).toEqual([]);
  });

  it("does not let a published version's media be re-checked into another state", async () => {
    await connect("facebook");
    const post = await scheduled(["facebook", "instagram"], [image()]);
    const [job] = await claimDuePublishJobs(db, "facebook", soon, 10);
    await recordPublishSuccess(db, job!.variantId, { externalPostId: "1_2", url: null, at: soon });

    const second = await addPostMedia(db, f.actors.admin, f.clients.kaveri.id, post.id, image("second.jpg"));
    expect(second.position).toBe(1);
    expect((await variantStatus(post.id, "facebook")).status).toBe("published");
  });
});
