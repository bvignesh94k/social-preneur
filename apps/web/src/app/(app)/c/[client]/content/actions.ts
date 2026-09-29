"use server";

import {
  CONTENT_CATEGORIES,
  ForbiddenError,
  InvalidInputError,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  NotFoundError,
  POST_STATUSES,
  SOCIAL_PLATFORMS,
  isIsoDate,
  mediaKindFor,
  momentIn,
  parseHashtags,
  type ContentCategory,
  type PostStatus,
  type SocialPlatform,
} from "@sp/core";
import {
  addPostMedia,
  createPost,
  duplicatePost,
  getPost,
  markVariantPublished,
  movePost,
  removePostMedia,
  removeVariant,
  retryVariant,
  saveContentMix,
  saveVariant,
  setIdeaStatus,
  setPostSchedule,
  setPostStatus,
  skipVariant,
  updatePost,
} from "@sp/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { requireWorkspace } from "@/lib/session";
import { getContentWorkspace } from "@/data/content";
import { deleteStoredMedia, isOwnMediaUrl } from "@/server/media";

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
      // A post can be started with one click and named later.
      title: text(formData, "title") || "Untitled post",
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
    const { db, scope, client } = await getContentWorkspace(slug);
    const postId = text(formData, "postId");
    const before = await getPost(db, scope, postId);
    const caption = text(formData, "caption");
    const hashtags = parseHashtags(text(formData, "hashtags"));

    await updatePost(db, actor, client.id, postId, {
      title: text(formData, "title") || "Untitled post",
      category: category(formData),
      plannedDate: text(formData, "plannedDate") || null,
      caption: caption || null,
      hashtags,
      creativeBrief: text(formData, "creativeBrief") || null,
      imagePrompt: text(formData, "imagePrompt") || null,
      notes: text(formData, "notes") || null,
      offeringId: text(formData, "offeringId") || null,
    });

    // A platform version still showing the old shared caption was never
    // customised, so it follows the new one. Edited versions are left alone.
    const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((tag, i) => tag === b[i]);
    for (const variant of before.variants) {
      if (variant.status === "published" || variant.status === "queued") continue;
      const followsShared =
        variant.caption === (before.caption ?? "") && sameTags(variant.hashtags, before.hashtags);
      if (!followsShared || (variant.caption === caption && sameTags(variant.hashtags, hashtags))) continue;
      await saveVariant(db, actor, client.id, postId, variant.platform, {
        caption,
        title: variant.title,
        linkUrl: variant.linkUrl,
        firstComment: variant.firstComment,
        hashtags,
      });
    }
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
      },
    );
  } catch (error) {
    return failure(error, values);
  }

  refresh(slug);
  return { ok: true };
}

// Turns a platform on for this post, starting from the shared caption.
export async function addPlatformAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");

  try {
    const { actor } = await requireWorkspace();
    const { db, scope, client } = await getContentWorkspace(slug);
    const postId = text(formData, "postId");
    const post = await getPost(db, scope, postId);
    const target = platform(formData);
    if (post.variants.some((variant) => variant.platform === target)) return { ok: true };
    await saveVariant(db, actor, client.id, postId, target, {
      caption: post.caption ?? "",
      hashtags: post.hashtags,
    });
  } catch (error) {
    return failure(error, snapshot(formData));
  }

  refresh(slug);
  return { ok: true };
}

// One control switches a platform on or off, so the same form works both ways.
export async function setPlatformAction(prev: FormState, formData: FormData): Promise<FormState> {
  return formData.get("turn") === "off" ? removeVariantAction(prev, formData) : addPlatformAction(prev, formData);
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

export async function markVariantPublishedAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");
  const values = snapshot(formData);

  try {
    const { actor } = await requireWorkspace();
    await markVariantPublished(
      await getDb(),
      actor,
      await clientIdFor(slug),
      text(formData, "postId"),
      platform(formData),
      { url: text(formData, "url") || null },
    );
  } catch (error) {
    return failure(error, values);
  }

  refresh(slug);
  return { ok: true };
}

export async function skipVariantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");

  try {
    const { actor } = await requireWorkspace();
    await skipVariant(await getDb(), actor, await clientIdFor(slug), text(formData, "postId"), platform(formData));
  } catch (error) {
    return failure(error, snapshot(formData));
  }

  refresh(slug);
  return { ok: true };
}

export async function retryVariantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");

  try {
    const { actor } = await requireWorkspace();
    await retryVariant(await getDb(), actor, await clientIdFor(slug), text(formData, "postId"), platform(formData));
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

export interface UploadedMedia {
  slug: string;
  postId: string;
  url: string;
  pathname: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  fileName: string;
}

// Called by the browser once a file has finished uploading. The address is
// checked against this app's own storage and this post's folder, so a
// post can never be pointed at a file from somewhere else.
export async function attachMediaAction(input: UploadedMedia): Promise<FormState> {
  const slug = String(input.slug);

  try {
    const { actor } = await requireWorkspace();
    const { client } = await getContentWorkspace(slug);
    const postId = String(input.postId);

    if (!isOwnMediaUrl(String(input.url), String(input.pathname), client.id, postId)) {
      throw new InvalidInputError("That upload could not be matched to this post. Try uploading it again.");
    }
    const kind = mediaKindFor(String(input.contentType));
    if (!kind) throw new InvalidInputError("Use a JPG, PNG or WebP image, or an MP4 or MOV video.");
    const size = Number(input.sizeBytes);
    if (!Number.isInteger(size) || size <= 0 || size > (kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) {
      throw new InvalidInputError("That file is too large.");
    }
    const dimension = (value: unknown) =>
      typeof value === "number" && Number.isInteger(value) && value > 0 && value < 100_000 ? value : null;

    try {
      await addPostMedia(await getDb(), actor, client.id, postId, {
        kind,
        url: String(input.url),
        pathname: String(input.pathname),
        contentType: String(input.contentType),
        sizeBytes: size,
        width: dimension(input.width),
        height: dimension(input.height),
        fileName: String(input.fileName ?? "").slice(0, 200),
      });
    } catch (error) {
      // Nothing points at the file, so it would only take up space.
      await deleteStoredMedia(String(input.url), String(input.pathname));
      throw error;
    }
  } catch (error) {
    return failure(error);
  }

  refresh(slug);
  return { ok: true };
}

export async function removeMediaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");

  try {
    const { actor } = await requireWorkspace();
    const { media, stillUsed } = await removePostMedia(
      await getDb(),
      actor,
      await clientIdFor(slug),
      text(formData, "postId"),
      text(formData, "mediaId"),
    );
    if (!stillUsed) await deleteStoredMedia(media.url, media.pathname);
  } catch (error) {
    return failure(error, snapshot(formData));
  }

  refresh(slug);
  return { ok: true };
}
