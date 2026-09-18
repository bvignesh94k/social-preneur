"use server";

import { ForbiddenError, InvalidInputError, NotFoundError, SOCIAL_PLATFORMS, type SocialPlatform } from "@sp/core";
import {
  addSocialAccount,
  disconnectOAuthAccount,
  removeSocialAccount,
  requireClientBySlug,
  updateSocialAccount,
} from "@sp/db";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { requireWorkspace } from "@/lib/session";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function platform(formData: FormData): SocialPlatform {
  const value = text(formData, "platform");
  if (!SOCIAL_PLATFORMS.includes(value as SocialPlatform)) throw new InvalidInputError("Pick a platform.");
  return value as SocialPlatform;
}

function failure(error: unknown, values?: Record<string, string>): FormState {
  if (error instanceof InvalidInputError) return { message: error.message, values };
  if (error instanceof ForbiddenError) return { message: "You do not have permission to manage accounts.", values };
  if (error instanceof NotFoundError) return { message: "That account no longer exists.", values };
  throw error;
}

async function clientIdFor(slug: string) {
  const { actor } = await requireWorkspace();
  const { client } = await requireClientBySlug(await getDb(), actor, "accounts.connect", slug);
  return { actor, clientId: client.id };
}

export async function addSocialAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");
  const values = Object.fromEntries(formData.entries()) as Record<string, string>;

  try {
    const { actor, clientId } = await clientIdFor(slug);
    await addSocialAccount(await getDb(), actor, clientId, platform(formData), {
      displayName: text(formData, "displayName"),
      handle: text(formData, "handle") || null,
      profileUrl: text(formData, "profileUrl") || null,
    });
  } catch (error) {
    return failure(error, values);
  }

  revalidatePath(`/c/${slug}/accounts`);
  return { ok: true };
}

export async function updateSocialAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");
  const values = Object.fromEntries(formData.entries()) as Record<string, string>;

  try {
    const { actor, clientId } = await clientIdFor(slug);
    await updateSocialAccount(await getDb(), actor, clientId, text(formData, "accountId"), {
      displayName: text(formData, "displayName"),
      handle: text(formData, "handle") || null,
      profileUrl: text(formData, "profileUrl") || null,
    });
  } catch (error) {
    return failure(error, values);
  }

  revalidatePath(`/c/${slug}/accounts`);
  return { ok: true };
}

export async function disconnectOAuthAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");

  try {
    const { actor, clientId } = await clientIdFor(slug);
    await disconnectOAuthAccount(await getDb(), actor, clientId, platform(formData));
  } catch (error) {
    return failure(error, Object.fromEntries(formData.entries()) as Record<string, string>);
  }

  revalidatePath(`/c/${slug}/accounts`);
  return { ok: true };
}

export async function removeSocialAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");

  try {
    const { actor, clientId } = await clientIdFor(slug);
    await removeSocialAccount(await getDb(), actor, clientId, text(formData, "accountId"));
  } catch (error) {
    return failure(error, Object.fromEntries(formData.entries()) as Record<string, string>);
  }

  revalidatePath(`/c/${slug}/accounts`);
  return { ok: true };
}
