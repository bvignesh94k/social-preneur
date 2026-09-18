import { ForbiddenError, InvalidInputError, NotFoundError } from "@sp/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireClientAccess } from "./access";
import type { Database } from "./client";
import {
  countPostsByCategory,
  createIdeas,
  createPost,
  duplicatePost,
  getContentMix,
  getPost,
  listIdeas,
  listPostTextsForComparison,
  listPostsInRange,
  movePost,
  removeVariant,
  saveContentMix,
  saveVariant,
  setIdeaStatus,
  setPostSchedule,
  setPostStatus,
  updatePost,
} from "./content";
import { createOffering } from "./brand";
import { createTestDatabase, seedTenancy, type TenancyFixture } from "./testing";

let db: Database;
let close: () => Promise<void>;
let f: TenancyFixture;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
  f = await seedTenancy(db);
});

afterAll(async () => {
  await close();
});

const basePost = { title: "Cold storage labels", category: "educational" as const };

async function scopeFor(clientId: string) {
  return requireClientAccess(db, f.actors.admin, "calendar.view", clientId);
}

describe("posts", () => {
  it("creates a post as a draft and reads it back with its client scope", async () => {
    const post = await createPost(db, f.actors.admin, f.clients.kaveri.id, {
      ...basePost,
      plannedDate: "2026-10-05",
      caption: "Three ways thermal labels survive cold storage",
      hashtags: ["#packaging", "labels", "packaging"],
    });

    expect(post.status).toBe("draft");
    expect(post.plannedDate).toBe("2026-10-05");
    // Hashtags are stored without the hash and without duplicates.
    expect(post.hashtags).toEqual(["packaging", "labels"]);

    const loaded = await getPost(db, await scopeFor(f.clients.kaveri.id), post.id);
    expect(loaded.title).toBe(basePost.title);
    expect(loaded.variants).toEqual([]);
  });

  it("refuses a post with no title", async () => {
    await expect(
      createPost(db, f.actors.admin, f.clients.kaveri.id, { ...basePost, title: "   " }),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("refuses a planned date that is not a date", async () => {
    await expect(
      createPost(db, f.actors.admin, f.clients.kaveri.id, { ...basePost, plannedDate: "next friday" }),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("hides another client's post even with a real id", async () => {
    const post = await createPost(db, f.actors.admin, f.clients.kaveri.id, basePost);
    const otherScope = await scopeFor(f.clients.northwind.id);
    await expect(getPost(db, otherScope, post.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to attach another client's product", async () => {
    const offering = await createOffering(db, f.actors.admin, f.clients.northwind.id, {
      kind: "service",
      name: "Cloud migration",
      summary: null,
      benefits: [],
      audience: null,
      url: null,
    });

    await expect(
      createPost(db, f.actors.admin, f.clients.kaveri.id, { ...basePost, offeringId: offering.id }),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("stops a writer from scheduling, while still allowing edits", async () => {
    const post = await createPost(db, f.actors.writer, f.clients.kaveri.id, basePost);
    expect(post.createdBy).toBe(f.actors.writer.userId);

    await expect(
      setPostSchedule(db, f.actors.writer, f.clients.kaveri.id, post.id, new Date("2026-10-06T04:30:00Z")),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps a client viewer out of content entirely", async () => {
    await expect(
      createPost(db, f.actors.viewer, f.clients.kaveri.id, basePost),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lists only the posts planned inside the range", async () => {
    const client = f.clients.northwind.id;
    await createPost(db, f.actors.admin, client, { ...basePost, title: "In range", plannedDate: "2026-11-10" });
    await createPost(db, f.actors.admin, client, { ...basePost, title: "Out of range", plannedDate: "2026-12-02" });
    await createPost(db, f.actors.admin, client, { ...basePost, title: "No date yet" });

    const inRange = await listPostsInRange(db, await scopeFor(client), { from: "2026-11-01", to: "2026-11-30" });
    expect(inRange.map((post) => post.title)).toEqual(["In range"]);
  });
});

describe("moving and scheduling", () => {
  it("clears the publish time when the post moves to another day", async () => {
    const client = f.clients.kaveri.id;
    const post = await createPost(db, f.actors.admin, client, { ...basePost, plannedDate: "2026-10-05" });
    const scheduled = await setPostSchedule(db, f.actors.admin, client, post.id, new Date("2026-10-05T04:30:00Z"));
    expect(scheduled.status).toBe("scheduled");

    const moved = await movePost(db, f.actors.admin, client, post.id, "2026-10-07");
    expect(moved.plannedDate).toBe("2026-10-07");
    expect(moved.scheduledAt).toBeNull();
    expect(moved.status).toBe("ready");
  });

  it("refuses to schedule a post that has no time set", async () => {
    const client = f.clients.kaveri.id;
    const post = await createPost(db, f.actors.admin, client, basePost);
    await setPostStatus(db, f.actors.admin, client, post.id, "ready");
    await expect(setPostStatus(db, f.actors.admin, client, post.id, "scheduled")).rejects.toThrow(
      /publish time/,
    );
  });

  it("refuses a status jump that skips the work in between", async () => {
    const post = await createPost(db, f.actors.admin, f.clients.kaveri.id, basePost);
    await expect(
      setPostStatus(db, f.actors.admin, f.clients.kaveri.id, post.id, "published"),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("walks a post from draft to scheduled", async () => {
    const client = f.clients.kaveri.id;
    const post = await createPost(db, f.actors.admin, client, { ...basePost, plannedDate: "2026-10-09" });

    expect((await setPostStatus(db, f.actors.admin, client, post.id, "ready")).status).toBe("ready");
    await setPostSchedule(db, f.actors.admin, client, post.id, new Date("2026-10-09T04:30:00Z"));
    expect((await getPost(db, await scopeFor(client), post.id)).status).toBe("scheduled");
  });
});

describe("platform versions", () => {
  it("marks a version ready when it satisfies the platform", async () => {
    const client = f.clients.kaveri.id;
    const post = await createPost(db, f.actors.admin, client, basePost);

    const variant = await saveVariant(db, f.actors.admin, client, post.id, "linkedin", {
      caption: "Three ways thermal labels survive cold storage",
      hashtags: ["packaging"],
    });

    expect(variant.status).toBe("ready");
    expect(variant.issues).toEqual([]);
  });

  it("holds a version back when the platform would reject it", async () => {
    const client = f.clients.kaveri.id;
    const post = await createPost(db, f.actors.admin, client, basePost);

    const tooLong = await saveVariant(db, f.actors.admin, client, post.id, "x", {
      caption: "a".repeat(400),
    });
    expect(tooLong.status).toBe("pending");
    expect(tooLong.issues.some((issue) => issue.level === "blocker")).toBe(true);

    const noImage = await saveVariant(db, f.actors.admin, client, post.id, "instagram", {
      caption: "Nice labels",
    });
    expect(noImage.status).toBe("pending");
    expect(noImage.issues[0]!.message).toMatch(/image or video/);
  });

  it("replaces the version for a platform instead of adding a second one", async () => {
    const client = f.clients.kaveri.id;
    const post = await createPost(db, f.actors.admin, client, basePost);

    await saveVariant(db, f.actors.admin, client, post.id, "linkedin", { caption: "First draft" });
    await saveVariant(db, f.actors.admin, client, post.id, "linkedin", { caption: "Second draft" });

    const loaded = await getPost(db, await scopeFor(client), post.id);
    expect(loaded.variants).toHaveLength(1);
    expect(loaded.variants[0]!.caption).toBe("Second draft");
  });

  it("removes a platform version", async () => {
    const client = f.clients.kaveri.id;
    const post = await createPost(db, f.actors.admin, client, basePost);
    await saveVariant(db, f.actors.admin, client, post.id, "threads", { caption: "Short one" });

    await removeVariant(db, f.actors.admin, client, post.id, "threads");
    expect((await getPost(db, await scopeFor(client), post.id)).variants).toEqual([]);
    await expect(removeVariant(db, f.actors.admin, client, post.id, "threads")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("duplicating", () => {
  it("copies the post and its platform versions as a fresh draft", async () => {
    const client = f.clients.kaveri.id;
    const post = await createPost(db, f.actors.admin, client, {
      ...basePost,
      plannedDate: "2026-10-05",
      caption: "Original caption",
    });
    await saveVariant(db, f.actors.admin, client, post.id, "linkedin", { caption: "LinkedIn copy" });
    await setPostStatus(db, f.actors.admin, client, post.id, "ready");

    const copy = await duplicatePost(db, f.actors.admin, client, post.id, "2026-10-12");
    expect(copy.title).toBe("Cold storage labels (copy)");
    expect(copy.plannedDate).toBe("2026-10-12");
    expect(copy.status).toBe("draft");

    const loaded = await getPost(db, await scopeFor(client), copy.id);
    expect(loaded.variants.map((variant) => variant.platform)).toEqual(["linkedin"]);
    // A copy starts unpublished even if the original was ready to go.
    expect(loaded.variants[0]!.status).toBe("pending");
  });
});

describe("ideas", () => {
  it("saves a batch, skips the empty ones, and marks one used when it becomes a post", async () => {
    const client = f.clients.kaveri.id;
    const saved = await createIdeas(db, f.actors.writer, client, [
      { hook: "Why uptime pages build trust", category: "educational" },
      { hook: "   ", category: "educational" },
    ]);
    expect(saved).toHaveLength(1);

    await createPost(db, f.actors.admin, client, { ...basePost, ideaId: saved[0]!.id });
    const used = await listIdeas(db, await scopeFor(client), "used");
    expect(used.map((idea) => idea.id)).toContain(saved[0]!.id);
  });

  it("records why an idea was dismissed", async () => {
    const client = f.clients.northwind.id;
    const [idea] = await createIdeas(db, f.actors.admin, client, [
      { hook: "Discount announcement", category: "promotional" },
    ]);

    const dismissed = await setIdeaStatus(db, f.actors.admin, client, idea!.id, "dismissed", "Off brand");
    expect(dismissed.status).toBe("dismissed");
    expect(dismissed.dismissedReason).toBe("Off brand");
  });
});

describe("monthly mix", () => {
  it("returns the sensible default before anything is set", async () => {
    const mix = await getContentMix(db, await scopeFor(f.clients.kaveri.id));
    expect(mix.educational).toBe(40);
    expect(Object.values(mix).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it("refuses shares that do not add up to a hundred", async () => {
    await expect(
      saveContentMix(db, f.actors.admin, f.clients.kaveri.id, { educational: 10, promotional: 10 }),
    ).rejects.toThrow(/make 100/);
  });

  it("saves the targets and reads them back", async () => {
    const saved = await saveContentMix(db, f.actors.admin, f.clients.kaveri.id, {
      educational: 50,
      promotional: 10,
      social_proof: 15,
      engagement: 10,
      behind_the_scenes: 10,
      news: 5,
    });
    expect(saved.educational).toBe(50);

    const mix = await getContentMix(db, await scopeFor(f.clients.kaveri.id));
    expect(mix.educational).toBe(50);
    expect(mix.promotional).toBe(10);
  });

  it("stops a writer from changing the strategy", async () => {
    await expect(
      saveContentMix(db, f.actors.writer, f.clients.kaveri.id, { ...{ educational: 100 } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("planning signals", () => {
  it("counts a month by category for the balance check", async () => {
    const client = f.clients.foreign.id;
    const outsider = f.actors.outsider;
    await createPost(db, outsider, client, { ...basePost, category: "promotional", plannedDate: "2027-01-05" });
    await createPost(db, outsider, client, { ...basePost, category: "promotional", plannedDate: "2027-01-06" });
    await createPost(db, outsider, client, { ...basePost, category: "educational", plannedDate: "2027-01-07" });

    const scope = await requireClientAccess(db, outsider, "calendar.view", client);
    const counts = await countPostsByCategory(db, scope, { from: "2027-01-01", to: "2027-01-31" });
    expect(counts).toEqual({ promotional: 2, educational: 1 });
  });

  it("returns this client's own text for the repetition check", async () => {
    const client = f.clients.foreign.id;
    const scope = await requireClientAccess(db, f.actors.outsider, "calendar.view", client);
    const texts = await listPostTextsForComparison(db, scope);

    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((row) => row.text.includes("Cold storage labels"))).toBe(true);
  });
});

describe("editing a post", () => {
  it("saves the edited fields and keeps the platform versions", async () => {
    const client = f.clients.kaveri.id;
    const post = await createPost(db, f.actors.admin, client, { ...basePost, caption: "First pass" });
    await saveVariant(db, f.actors.admin, client, post.id, "linkedin", { caption: "Platform copy" });

    const updated = await updatePost(db, f.actors.admin, client, post.id, {
      title: "Cold chain labels",
      category: "social_proof",
      caption: "Second pass",
      hashtags: ["coldchain"],
      creativeBrief: "Show a freezer shelf",
    });

    expect(updated.title).toBe("Cold chain labels");
    expect(updated.category).toBe("social_proof");
    expect(updated.caption).toBe("Second pass");
    expect(updated.creativeBrief).toBe("Show a freezer shelf");

    const loaded = await getPost(db, await scopeFor(client), post.id);
    expect(loaded.variants).toHaveLength(1);
  });

  it("refuses to edit a post that belongs to another client", async () => {
    const post = await createPost(db, f.actors.admin, f.clients.kaveri.id, basePost);
    await expect(
      updatePost(db, f.actors.admin, f.clients.northwind.id, post.id, basePost),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
