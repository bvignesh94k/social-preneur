import "server-only";
import {
  ForbiddenError,
  NotFoundError,
  compareMix,
  isAllowed,
  mixWarnings,
  monthBounds,
  todayIn,
  type ContentCategory,
} from "@sp/core";
import {
  countPostsByCategory,
  getContentMix,
  getPost,
  listIdeas,
  listOfferings,
  listPostsInRange,
  requireClientBySlug,
  type PostWithVariants,
} from "@sp/db";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";

export const getContentWorkspace = cache(async (slug: string) => {
  const { actor } = await requireWorkspace();
  const db = await getDb();

  let found: Awaited<ReturnType<typeof requireClientBySlug>>;
  try {
    found = await requireClientBySlug(db, actor, "calendar.view", slug);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  }

  const target = { clientRole: found.scope.clientRole };
  return {
    db,
    scope: found.scope,
    client: {
      id: found.client.id,
      name: found.client.name,
      slug: found.client.slug,
      timezone: found.client.timezone,
      defaultLanguage: found.client.defaultLanguage,
      publishingPaused: found.client.publishingPausedAt !== null,
    },
    can: {
      edit: isAllowed(actor, "content.edit", target),
      schedule: isAllowed(actor, "post.schedule", target),
      strategy: isAllowed(actor, "strategy.edit", target),
      generate: isAllowed(actor, "ideas.generate", target),
    },
  };
});

export interface DayPlan {
  date: string;
  posts: PostWithVariants[];
}

export async function getMonthPlan(slug: string, year: number, month: number) {
  const { db, scope, client, can } = await getContentWorkspace(slug);
  const bounds = monthBounds(year, month);

  const [postsInMonth, counts, targets] = await Promise.all([
    listPostsInRange(db, scope, bounds),
    countPostsByCategory(db, scope, bounds),
    getContentMix(db, scope),
  ]);

  const byDay = new Map<string, PostWithVariants[]>();
  for (const post of postsInMonth) {
    if (!post.plannedDate) continue;
    const list = byDay.get(post.plannedDate) ?? [];
    list.push(post);
    byDay.set(post.plannedDate, list);
  }

  const mix = compareMix(counts as Partial<Record<ContentCategory, number>>, targets);

  return {
    client,
    can,
    year,
    month,
    today: todayIn(client.timezone),
    postsInMonth,
    byDay,
    mix,
    warnings: mixWarnings(mix),
  };
}

export async function getPostDetail(slug: string, postId: string) {
  const { db, scope, client, can } = await getContentWorkspace(slug);

  let post: PostWithVariants;
  try {
    post = await getPost(db, scope, postId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const offerings = await listOfferings(db, scope);

  return {
    client,
    can,
    post,
    today: todayIn(client.timezone),
    offerings: offerings
      .filter((offering) => offering.status === "active")
      .map(({ id, name, kind }) => ({ id, name, kind })),
  };
}

export async function getIdeaInbox(slug: string) {
  const { db, scope, client, can } = await getContentWorkspace(slug);
  const ideas = await listIdeas(db, scope, "new");
  return { client, can, ideas };
}
