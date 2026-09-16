"use server";

import {
  CONTENT_CATEGORIES,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  POST_STATUSES,
  SOCIAL_PLATFORMS,
  isIsoDate,
  momentIn,
  parseHashtags,
  type ContentCategory,
  type PostStatus,
  type SocialPlatform,
} from "@sp/core";
import {
  createPost,
  duplicatePost,
  movePost,
  removeVariant,
  saveContentMix,
  saveVariant,
  setIdeaStatus,
  setPostSchedule,
  setPostStatus,
  updatePost,
} from "@sp/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { requireWorkspace } from "@/lib/session";
import { getContentWorkspace } from "@/data/content";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function snapshot(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || key.startsWith("$ACTION")) continue;
    values[key] = key in values ? `${values[key]}|${value}` : value;
  }
  return values;
}

function failure(error: unknown, values?: Record<string, string>): FormState {
  if (error instanceof InvalidInputError) return { message: error.message, values };
  if (error instanceof ForbiddenError) return { message: "You do not have permission to make this change.", values };
  if (error instanceof NotFoundError) return { message: "That post no longer exists.", values };
  throw error;
}

function refresh(slug: string) {
  revalidatePath(/^[a-z0-9-]{1,60}$/.test(slug) ? `/c/${slug}` : "/", "layout");
}

function category(formData: FormData): ContentCategory {
  const value = text(formData, "category");
  if (!CONTENT_CATEGORIES.includes(value as ContentCategory)) {
    throw new InvalidInputError("Pick a content category.");
  }
  return value as ContentCategory;
}

function platform(formData: FormData): SocialPlatform {
  const value = text(formData, "platform");
  if (!SOCIAL_PLATFORMS.includes(value as SocialPlatform)) {
    throw new InvalidInputError("Pick a platform.");
  }
  return value as SocialPlatform;
}

async function clientIdFor(slug: string): Promise<string> {
  const { client } = await getContentWorkspace(slug);
  return client.id;
}

export async function createPostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");
  const values = snapshot(formData);

  let postId: string;
  try {
    const { actor } = await requireWorkspace();
    const plannedDate = text(formData, "plannedDate");
    const post = await createPost(await getDb(), actor, await clientIdFor(slug), {
      title: text(formData, "title"),
      category: category(formData),
      plannedDate: plannedDate || null,
    });
    postId = post.id;
  } catch (error) {
    return failure(error, values);
  }

  refresh(slug);
  redirect(`/c/${slug}/content/${postId}`);
}

export async function updatePostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");
  const values = snapshot(formData);

  try {
    const { actor } = await requireWorkspace();
    await updatePost(await getDb(), actor, await clientIdFor(slug), text(formData, "postId"), {
      title: text(formData, "title"),
      category: category(formData),
      plannedDate: text(formData, "plannedDate") || null,
      caption: text(formData, "caption") || null,
      hashtags: parseHashtags(text(formData, "hashtags")),
      creativeBrief: text(formData, "creativeBrief") || null,
      imagePrompt: text(formData, "imagePrompt") || null,
      notes: text(formData, "notes") || null,
      offeringId: text(formData, "offeringId") || null,
    });
  } catch (error) {
    return failure(error, values);
  }

  refresh(slug);
  return { ok: true };
}

export async function movePostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");

  try {
    const { actor } = await requireWorkspace();
    await movePost(
      await getDb(),
      actor,
      await clientIdFor(slug),
      text(formData, "postId"),
      text(formData, "plannedDate"),
    );
  } catch (error) {
    return failure(error, snapshot(formData));
  }

  refresh(slug);
  return { ok: true };
}

export async function setPostStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");
  const status = text(formData, "status");
  if (!POST_STATUSES.includes(status as PostStatus)) {
    return { message: "That is not a status a post can be in." };
  }

  try {
    const { actor } = await requireWorkspace();
    await setPostStatus(
      await getDb(),
      actor,
      await clientIdFor(slug),
      text(formData, "postId"),
      status as PostStatus,
    );
  } catch (error) {
    return failure(error, snapshot(formData));
  }

  refresh(slug);
  return { ok: true };
}

export async function schedulePostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");
  const values = snapshot(formData);

  try {
    const { actor } = await requireWorkspace();
    const { client } = await getContentWorkspace(slug);
    const date = text(formData, "plannedDate");
    const time = text(formData, "time");

    if (!isIsoDate(date)) throw new InvalidInputError("Pick the day to publish on.");
    if (!/^\d{2}:\d{2}$/.test(time)) throw new InvalidInputError("Give a time like 09:30.");

    // Stored as a real moment, read from the wall clock time where the client is.
    const at = momentIn(client.timezone, date, time);
    if (at.getTime() < Date.now()) throw new InvalidInputError("That time has already passed.");

    const db = await getDb();
    await movePost(db, actor, client.id, text(formData, "postId"), date);
    await setPostSchedule(db, actor, client.id, text(formData, "postId"), at);
  } catch (error) {
    return failure(error, values);
  }

  refresh(slug);
  return { ok: true };
}

export async function unschedulePostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");

  try {
    const { actor } = await requireWorkspace();
    await setPostSchedule(await getDb(), actor, await clientIdFor(slug), text(formData, "postId"), null);
  } catch (error) {
    return failure(error, snapshot(formData));
  }

  refresh(slug);
  return { ok: true };
}

export async function duplicatePostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");
  let copyId: string;

  try {
    const { actor } = await requireWorkspace();
    const copy = await duplicatePost(
      await getDb(),
      actor,
      await clientIdFor(slug),
      text(formData, "postId"),
      text(formData, "plannedDate") || null,
    );
    copyId = copy.id;
  } catch (error) {
    return failure(error, snapshot(formData));
  }

  refresh(slug);
  redirect(`/c/${slug}/content/${copyId}`);
}

export async function saveVariantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");
  const values = snapshot(formData);

  try {
    const { actor } = await requireWorkspace();
    await saveVariant(
      await getDb(),
      actor,
      await clientIdFor(slug),
      text(formData, "postId"),
      platform(formData),
      {
        caption: text(formData, "caption"),
        title: text(formData, "title") || null,
        linkUrl: text(formData, "linkUrl") || null,
        firstComment: text(formData, "firstComment") || null,
        hashtags: parseHashtags(text(formData, "hashtags")),
        hasMedia: formData.get("hasMedia") === "on",
      },
    );
  } catch (error) {
    return failure(error, values);
  }

  refresh(slug);
  return { ok: true };
}

export async function removeVariantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");

  try {
    const { actor } = await requireWorkspace();
    await removeVariant(
      await getDb(),
      actor,
      await clientIdFor(slug),
      text(formData, "postId"),
      platform(formData),
    );
  } catch (error) {
    return failure(error, snapshot(formData));
  }

  refresh(slug);
  return { ok: true };
}

export async function saveMixAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");
  const values = snapshot(formData);

  try {
    const { actor } = await requireWorkspace();
    const targets: Partial<Record<ContentCategory, number>> = {};
    for (const key of CONTENT_CATEGORIES) {
      const raw = text(formData, key);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new InvalidInputError("Every share needs to be a number.");
      targets[key] = Math.round(value);
    }
    await saveContentMix(await getDb(), actor, await clientIdFor(slug), targets);
  } catch (error) {
    return failure(error, values);
  }

  refresh(slug);
  return { ok: true };
}

export async function dismissIdeaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");

  try {
    const { actor } = await requireWorkspace();
    await setIdeaStatus(
      await getDb(),
      actor,
      await clientIdFor(slug),
      text(formData, "ideaId"),
      "dismissed",
      text(formData, "reason") || null,
    );
  } catch (error) {
    return failure(error, snapshot(formData));
  }

  refresh(slug);
  return { ok: true };
}
