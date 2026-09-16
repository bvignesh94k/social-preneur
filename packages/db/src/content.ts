import {
  CONTENT_CATEGORIES,
  DEFAULT_CONTENT_MIX,
  InvalidInputError,
  NotFoundError,
  checkVariant,
  type Actor,
  type ContentCategory,
  type IdeaStatus,
  type PostSource,
  type PostStatus,
  type SocialPlatform,
  type VariantIssue,
  type VariantStatus,
} from "@sp/core";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import { requireClientAccess, type ClientScope } from "./access";
import { recordAudit } from "./audit";
import type { Database } from "./client";
import { isForeignKeyViolation } from "./errors";
import { contentMix, ideas, postVariants, posts } from "./schema";

export type Post = typeof posts.$inferSelect;
export type PostVariant = typeof postVariants.$inferSelect;
export type Idea = typeof ideas.$inferSelect;

export interface PostWithVariants extends Post {
  variants: PostVariant[];
}

function audit(scope: ClientScope) {
  return {
    agencyId: scope.agencyId,
    clientId: scope.clientId,
    actorType: "user" as const,
    actorId: scope.actor.userId,
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDate(value: string | null | undefined, field: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!DATE_RE.test(trimmed)) throw new InvalidInputError(`${field} must be a date like 2026-09-30.`);
  return trimmed;
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanList(values: string[] | undefined): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim().replace(/^#/, "");
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

// ---------- Reads ----------

export interface PostRange {
  from: string;
  to: string;
}

export async function listPostsInRange(
  db: Database,
  scope: ClientScope,
  range: PostRange,
): Promise<PostWithVariants[]> {
  const rows = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.clientId, scope.clientId),
        ne(posts.status, "archived"),
        isNotNull(posts.plannedDate),
        gte(posts.plannedDate, cleanDate(range.from, "Start date")!),
        lte(posts.plannedDate, cleanDate(range.to, "End date")!),
      ),
    )
    .orderBy(asc(posts.plannedDate), asc(posts.createdAt));

  return attachVariants(db, scope, rows);
}

export async function listPostsByStatus(
  db: Database,
  scope: ClientScope,
  statuses: PostStatus[],
): Promise<PostWithVariants[]> {
  if (statuses.length === 0) return [];
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.clientId, scope.clientId), inArray(posts.status, statuses)))
    .orderBy(asc(posts.plannedDate), desc(posts.createdAt));

  return attachVariants(db, scope, rows);
}

async function attachVariants(
  db: Database,
  scope: ClientScope,
  rows: Post[],
): Promise<PostWithVariants[]> {
  if (rows.length === 0) return [];
  const variants = await db
    .select()
    .from(postVariants)
    .where(
      and(
        eq(postVariants.clientId, scope.clientId),
        inArray(
          postVariants.postId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .orderBy(asc(postVariants.platform));

  const byPost = new Map<string, PostVariant[]>();
  for (const variant of variants) {
    const list = byPost.get(variant.postId) ?? [];
    list.push(variant);
    byPost.set(variant.postId, list);
  }
  return rows.map((row) => ({ ...row, variants: byPost.get(row.id) ?? [] }));
}

export async function getPost(db: Database, scope: ClientScope, postId: string): Promise<PostWithVariants> {
  const [row] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.clientId, scope.clientId), eq(posts.id, postId)))
    .limit(1);
  if (!row) throw new NotFoundError("Post");

  const [withVariants] = await attachVariants(db, scope, [row]);
  return withVariants!;
}

export async function listIdeas(db: Database, scope: ClientScope, status?: IdeaStatus): Promise<Idea[]> {
  return db
    .select()
    .from(ideas)
    .where(
      status
        ? and(eq(ideas.clientId, scope.clientId), eq(ideas.status, status))
        : eq(ideas.clientId, scope.clientId),
    )
    .orderBy(desc(ideas.createdAt));
}

export async function getContentMix(
  db: Database,
  scope: ClientScope,
): Promise<Record<ContentCategory, number>> {
  const rows = await db
    .select({ category: contentMix.category, targetPercent: contentMix.targetPercent })
    .from(contentMix)
    .where(eq(contentMix.clientId, scope.clientId));

  if (rows.length === 0) return { ...DEFAULT_CONTENT_MIX };

  const result = { ...DEFAULT_CONTENT_MIX };
  for (const row of rows) result[row.category] = row.targetPercent;
  return result;
}

export async function countPostsByCategory(
  db: Database,
  scope: ClientScope,
  range: PostRange,
): Promise<Partial<Record<ContentCategory, number>>> {
  const rows = await db
    .select({ category: posts.category, total: count() })
    .from(posts)
    .where(
      and(
        eq(posts.clientId, scope.clientId),
        ne(posts.status, "archived"),
        isNotNull(posts.plannedDate),
        gte(posts.plannedDate, cleanDate(range.from, "Start date")!),
        lte(posts.plannedDate, cleanDate(range.to, "End date")!),
      ),
    )
    .groupBy(posts.category);

  return Object.fromEntries(rows.map((row) => [row.category, Number(row.total)]));
}

// Text the repetition guard compares a new idea against: what this client has
// already published, drafted or scheduled.
export async function listPostTextsForComparison(
  db: Database,
  scope: ClientScope,
  limit = 200,
): Promise<{ id: string; text: string; label: string; plannedDate: string | null }[]> {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      caption: posts.caption,
      plannedDate: posts.plannedDate,
    })
    .from(posts)
    .where(and(eq(posts.clientId, scope.clientId), ne(posts.status, "archived")))
    .orderBy(desc(posts.plannedDate), desc(posts.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    text: [row.title, row.caption].filter(Boolean).join(" "),
    label: row.title,
    plannedDate: row.plannedDate,
  }));
}

// ---------- Posts ----------

export interface PostInput {
  title: string;
  category: ContentCategory;
  language?: "en" | "ta" | "en_ta";
  plannedDate?: string | null;
  caption?: string | null;
  hashtags?: string[];
  creativeBrief?: string | null;
  imagePrompt?: string | null;
  notes?: string | null;
  offeringId?: string | null;
  ideaId?: string | null;
  source?: PostSource;
}

function cleanPost(input: PostInput) {
  const title = input.title.trim();
  if (!title) throw new InvalidInputError("Give the post a title so you can find it later.");
  if (!CONTENT_CATEGORIES.includes(input.category)) throw new InvalidInputError("Pick a content category.");

  return {
    title,
    category: input.category,
    language: input.language ?? "en",
    plannedDate: cleanDate(input.plannedDate, "Planned date"),
    caption: cleanText(input.caption),
    hashtags: cleanList(input.hashtags),
    creativeBrief: cleanText(input.creativeBrief),
    imagePrompt: cleanText(input.imagePrompt),
    notes: cleanText(input.notes),
    offeringId: input.offeringId?.trim() || null,
    ideaId: input.ideaId?.trim() || null,
  };
}

function rethrowMissingLink(error: unknown): never {
  if (isForeignKeyViolation(error)) {
    throw new InvalidInputError("That product or idea belongs to a different client.");
  }
  throw error;
}

export async function createPost(db: Database, actor: Actor, clientId: string, input: PostInput): Promise<Post> {
  const scope = await requireClientAccess(db, actor, "content.edit", clientId);
  const clean = cleanPost(input);

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(posts)
        .values({
          ...clean,
          clientId: scope.clientId,
          agencyId: scope.agencyId,
          source: input.source ?? "manual",
          status: "draft",
          createdBy: actor.userId,
        })
        .returning();
      if (!row) throw new Error("Post insert returned no row");

      if (clean.ideaId) {
        await tx
          .update(ideas)
          .set({ status: "used" })
          .where(and(eq(ideas.clientId, scope.clientId), eq(ideas.id, clean.ideaId)));
      }

      await recordAudit(tx, {
        ...audit(scope),
        action: "content.post_created",
        objectType: "post",
        objectId: row.id,
        after: { title: row.title, category: row.category, plannedDate: row.plannedDate },
      });
      return row;
    });
  } catch (error) {
    return rethrowMissingLink(error);
  }
}

export async function updatePost(
  db: Database,
  actor: Actor,
  clientId: string,
  postId: string,
  input: PostInput,
): Promise<Post> {
  const scope = await requireClientAccess(db, actor, "content.edit", clientId);
  const clean = cleanPost(input);

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .update(posts)
        .set(clean)
        .where(and(eq(posts.clientId, scope.clientId), eq(posts.id, postId)))
        .returning();
      if (!row) throw new NotFoundError("Post");

      await recordAudit(tx, {
        ...audit(scope),
        action: "content.post_updated",
        objectType: "post",
        objectId: row.id,
        after: { title: row.title, category: row.category, plannedDate: row.plannedDate },
      });
      return row;
    });
  } catch (error) {
    return rethrowMissingLink(error);
  }
}

// Dragging a post to another day on the calendar.
export async function movePost(
  db: Database,
  actor: Actor,
  clientId: string,
  postId: string,
  plannedDate: string,
): Promise<Post> {
  const scope = await requireClientAccess(db, actor, "content.edit", clientId);
  const date = cleanDate(plannedDate, "Planned date");
  if (!date) throw new InvalidInputError("Pick a day to move the post to.");

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ plannedDate: posts.plannedDate, scheduledAt: posts.scheduledAt, status: posts.status })
      .from(posts)
      .where(and(eq(posts.clientId, scope.clientId), eq(posts.id, postId)))
      .limit(1);
    if (!before) throw new NotFoundError("Post");
    if (before.status === "published") throw new InvalidInputError("This post is already published.");

    // A time set for the old day no longer means anything once the day changes.
    const [row] = await tx
      .update(posts)
      .set({
        plannedDate: date,
        scheduledAt: null,
        status: before.status === "scheduled" ? "ready" : before.status,
      })
      .where(and(eq(posts.clientId, scope.clientId), eq(posts.id, postId)))
      .returning();
    if (!row) throw new NotFoundError("Post");

    await recordAudit(tx, {
      ...audit(scope),
      action: "content.post_moved",
      objectType: "post",
      objectId: postId,
      before: { plannedDate: before.plannedDate },
      after: { plannedDate: date },
    });
    return row;
  });
}

const STATUS_FLOW: Record<PostStatus, PostStatus[]> = {
  idea: ["draft", "archived"],
  draft: ["needs_creative", "ready", "archived"],
  needs_creative: ["draft", "ready", "archived"],
  ready: ["draft", "scheduled", "archived"],
  scheduled: ["ready", "archived"],
  published: [],
  failed: ["ready", "archived"],
  archived: ["draft"],
};

export async function setPostStatus(
  db: Database,
  actor: Actor,
  clientId: string,
  postId: string,
  status: PostStatus,
): Promise<Post> {
  const permission = status === "scheduled" ? "post.schedule" : "content.edit";
  const scope = await requireClientAccess(db, actor, permission, clientId);

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(posts)
      .where(and(eq(posts.clientId, scope.clientId), eq(posts.id, postId)))
      .limit(1);
    if (!current) throw new NotFoundError("Post");
    if (current.status === status) return current;

    if (!STATUS_FLOW[current.status].includes(status)) {
      throw new InvalidInputError(`A ${current.status} post cannot move straight to ${status}.`);
    }
    if (status === "scheduled" && !current.scheduledAt) {
      throw new InvalidInputError("Set a publish time before scheduling the post.");
    }

    const [row] = await tx
      .update(posts)
      .set({ status, archivedAt: status === "archived" ? new Date() : null })
      .where(and(eq(posts.clientId, scope.clientId), eq(posts.id, postId)))
      .returning();
    if (!row) throw new NotFoundError("Post");

    await recordAudit(tx, {
      ...audit(scope),
      action: "content.post_status_changed",
      objectType: "post",
      objectId: postId,
      before: { status: current.status },
      after: { status },
    });
    return row;
  });
}

export async function setPostSchedule(
  db: Database,
  actor: Actor,
  clientId: string,
  postId: string,
  scheduledAt: Date | null,
): Promise<Post> {
  const scope = await requireClientAccess(db, actor, "post.schedule", clientId);

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: posts.status })
      .from(posts)
      .where(and(eq(posts.clientId, scope.clientId), eq(posts.id, postId)))
      .limit(1);
    if (!current) throw new NotFoundError("Post");
    if (current.status === "published") throw new InvalidInputError("This post is already published.");

    const [row] = await tx
      .update(posts)
      .set({ scheduledAt, status: scheduledAt ? "scheduled" : "ready" })
      .where(and(eq(posts.clientId, scope.clientId), eq(posts.id, postId)))
      .returning();
    if (!row) throw new NotFoundError("Post");

    await recordAudit(tx, {
      ...audit(scope),
      action: scheduledAt ? "content.post_scheduled" : "content.post_unscheduled",
      objectType: "post",
      objectId: postId,
      after: { scheduledAt: scheduledAt?.toISOString() ?? null },
    });
    return row;
  });
}

export async function duplicatePost(
  db: Database,
  actor: Actor,
  clientId: string,
  postId: string,
  plannedDate: string | null,
): Promise<Post> {
  const scope = await requireClientAccess(db, actor, "content.edit", clientId);

  return db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(posts)
      .where(and(eq(posts.clientId, scope.clientId), eq(posts.id, postId)))
      .limit(1);
    if (!source) throw new NotFoundError("Post");

    const [copy] = await tx
      .insert(posts)
      .values({
        agencyId: scope.agencyId,
        clientId: scope.clientId,
        title: `${source.title} (copy)`,
        category: source.category,
        language: source.language,
        source: source.source,
        plannedDate: cleanDate(plannedDate, "Planned date") ?? source.plannedDate,
        caption: source.caption,
        hashtags: source.hashtags,
        creativeBrief: source.creativeBrief,
        imagePrompt: source.imagePrompt,
        notes: source.notes,
        offeringId: source.offeringId,
        status: "draft",
        createdBy: actor.userId,
      })
      .returning();
    if (!copy) throw new Error("Post copy returned no row");

    const sourceVariants = await tx
      .select()
      .from(postVariants)
      .where(and(eq(postVariants.clientId, scope.clientId), eq(postVariants.postId, postId)));

    if (sourceVariants.length > 0) {
      await tx.insert(postVariants).values(
        sourceVariants.map((variant) => ({
          agencyId: scope.agencyId,
          clientId: scope.clientId,
          postId: copy.id,
          platform: variant.platform,
          caption: variant.caption,
          title: variant.title,
          linkUrl: variant.linkUrl,
          firstComment: variant.firstComment,
          hashtags: variant.hashtags,
          issues: variant.issues,
          status: "pending" as const,
        })),
      );
    }

    await recordAudit(tx, {
      ...audit(scope),
      action: "content.post_duplicated",
      objectType: "post",
      objectId: copy.id,
      after: { copiedFrom: postId },
    });
    return copy;
  });
}

// ---------- Platform versions ----------

export interface VariantInput {
  caption: string;
  title?: string | null;
  linkUrl?: string | null;
  firstComment?: string | null;
  hashtags?: string[];
  hasMedia?: boolean;
}

export async function saveVariant(
  db: Database,
  actor: Actor,
  clientId: string,
  postId: string,
  platform: SocialPlatform,
  input: VariantInput,
): Promise<PostVariant> {
  const scope = await requireClientAccess(db, actor, "content.edit", clientId);

  const caption = input.caption.trim();
  const hashtags = cleanList(input.hashtags);
  const issues: VariantIssue[] = checkVariant(platform, {
    caption,
    title: input.title,
    linkUrl: input.linkUrl,
    hashtags,
    hasMedia: input.hasMedia ?? false,
  });
  // The platform decides what is publishable, so the stored state follows its rules.
  const status: VariantStatus = issues.some((issue) => issue.level === "blocker") ? "pending" : "ready";

  return db.transaction(async (tx) => {
    const [parent] = await tx
      .select({ id: posts.id, status: posts.status })
      .from(posts)
      .where(and(eq(posts.clientId, scope.clientId), eq(posts.id, postId)))
      .limit(1);
    if (!parent) throw new NotFoundError("Post");
    if (parent.status === "published") throw new InvalidInputError("This post is already published.");

    const values = {
      agencyId: scope.agencyId,
      clientId: scope.clientId,
      postId,
      platform,
      caption,
      title: cleanText(input.title),
      linkUrl: cleanText(input.linkUrl),
      firstComment: cleanText(input.firstComment),
      hashtags,
      issues,
      status,
    };

    const [row] = await tx
      .insert(postVariants)
      .values(values)
      .onConflictDoUpdate({
        target: [postVariants.postId, postVariants.platform],
        set: {
          caption: values.caption,
          title: values.title,
          linkUrl: values.linkUrl,
          firstComment: values.firstComment,
          hashtags: values.hashtags,
          issues: values.issues,
          status: values.status,
        },
      })
      .returning();
    if (!row) throw new Error("Variant upsert returned no row");

    await recordAudit(tx, {
      ...audit(scope),
      action: "content.variant_saved",
      objectType: "post_variant",
      objectId: row.id,
      after: { platform, status, issues: issues.length },
    });
    return row;
  });
}

export async function removeVariant(
  db: Database,
  actor: Actor,
  clientId: string,
  postId: string,
  platform: SocialPlatform,
): Promise<void> {
  const scope = await requireClientAccess(db, actor, "content.edit", clientId);

  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(postVariants)
      .where(
        and(
          eq(postVariants.clientId, scope.clientId),
          eq(postVariants.postId, postId),
          eq(postVariants.platform, platform),
        ),
      )
      .returning({ id: postVariants.id });
    if (!row) throw new NotFoundError("Platform version");

    await recordAudit(tx, {
      ...audit(scope),
      action: "content.variant_removed",
      objectType: "post_variant",
      objectId: row.id,
      before: { platform },
    });
  });
}

// ---------- Ideas ----------

export interface IdeaInput {
  hook: string;
  concept?: string | null;
  angle?: string | null;
  category: ContentCategory;
  source?: PostSource;
  sourceRef?: string | null;
  offeringId?: string | null;
}

export async function createIdeas(
  db: Database,
  actor: Actor,
  clientId: string,
  inputs: IdeaInput[],
): Promise<Idea[]> {
  const scope = await requireClientAccess(db, actor, "ideas.generate", clientId);
  const rows = inputs
    .map((input) => ({
      agencyId: scope.agencyId,
      clientId: scope.clientId,
      hook: input.hook.trim(),
      concept: cleanText(input.concept),
      angle: cleanText(input.angle),
      category: input.category,
      source: input.source ?? "ai",
      sourceRef: cleanText(input.sourceRef),
      offeringId: input.offeringId?.trim() || null,
      createdBy: actor.userId,
    }))
    .filter((row) => row.hook.length > 0);

  if (rows.length === 0) return [];

  try {
    return await db.transaction(async (tx) => {
      const saved = await tx.insert(ideas).values(rows).returning();
      await recordAudit(tx, {
        ...audit(scope),
        action: "content.ideas_created",
        objectType: "idea",
        objectId: null,
        after: { count: saved.length, source: rows[0]!.source },
      });
      return saved;
    });
  } catch (error) {
    return rethrowMissingLink(error);
  }
}

export async function setIdeaStatus(
  db: Database,
  actor: Actor,
  clientId: string,
  ideaId: string,
  status: IdeaStatus,
  reason?: string | null,
): Promise<Idea> {
  const scope = await requireClientAccess(db, actor, "content.edit", clientId);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(ideas)
      .set({ status, dismissedReason: status === "dismissed" ? cleanText(reason) : null })
      .where(and(eq(ideas.clientId, scope.clientId), eq(ideas.id, ideaId)))
      .returning();
    if (!row) throw new NotFoundError("Idea");

    await recordAudit(tx, {
      ...audit(scope),
      action: "content.idea_status_changed",
      objectType: "idea",
      objectId: ideaId,
      after: { status },
    });
    return row;
  });
}

// ---------- Monthly mix ----------

export async function saveContentMix(
  db: Database,
  actor: Actor,
  clientId: string,
  targets: Partial<Record<ContentCategory, number>>,
): Promise<Record<ContentCategory, number>> {
  const scope = await requireClientAccess(db, actor, "strategy.edit", clientId);

  const rows = CONTENT_CATEGORIES.map((category) => {
    const value = targets[category] ?? DEFAULT_CONTENT_MIX[category];
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new InvalidInputError("Each share must be a whole number between 0 and 100.");
    }
    return { category, targetPercent: value };
  });

  const total = rows.reduce((sum, row) => sum + row.targetPercent, 0);
  if (total !== 100) {
    throw new InvalidInputError(`The shares add up to ${total} percent. They need to make 100.`);
  }

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx
        .insert(contentMix)
        .values({
          agencyId: scope.agencyId,
          clientId: scope.clientId,
          category: row.category,
          targetPercent: row.targetPercent,
          updatedBy: actor.userId,
        })
        .onConflictDoUpdate({
          target: [contentMix.clientId, contentMix.category],
          set: { targetPercent: row.targetPercent, updatedBy: actor.userId },
        });
    }

    await recordAudit(tx, {
      ...audit(scope),
      action: "strategy.mix_saved",
      objectType: "content_mix",
      objectId: scope.clientId,
      after: Object.fromEntries(rows.map((row) => [row.category, row.targetPercent])),
    });
  });

  return Object.fromEntries(rows.map((row) => [row.category, row.targetPercent])) as Record<
    ContentCategory,
    number
  >;
}
