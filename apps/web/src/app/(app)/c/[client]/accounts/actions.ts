"use server";

import { ForbiddenError, InvalidInputError, NotFoundError, SOCIAL_PLATFORMS, type SocialPlatform } from "@sp/core";
import {
  addSocialAccount,
  disconnectOAuthAccount,
  removeSocialAccount,
  requireClientBySlug,
  saveOAuthConnection,
  updateSocialAccount,
} from "@sp/db";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import type { FormState } from "@/lib/form-state";
import { requireWorkspace } from "@/lib/session";
import { META_SCOPES, MetaApiError, listManagedPages } from "@/server/oauth/meta";
import { META_PICK_COOKIE, openMetaPick } from "@/server/oauth/meta-pick";
import { encryptToken } from "@/server/oauth/token-crypto";

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

// Links the Page the person chose to this client. The Page list is fetched
// again with the token from the picker cookie, so only a Page the person
// really manages can be saved, whatever the form submitted.
export async function chooseFacebookPageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");
  const pageId = text(formData, "pageId");
  if (!pageId) return { message: "Choose the Page that belongs to this client." };
  if (!env.META_APP_SECRET || !env.TOKEN_ENCRYPTION_KEY) return { message: "Facebook is not configured on the server." };

  let pageName: string;
  try {
    const { actor, clientId } = await clientIdFor(slug);
    const cookieStore = await cookies();
    const pick = openMetaPick(cookieStore.get(META_PICK_COOKIE)?.value, env.TOKEN_ENCRYPTION_KEY, {
      userId: actor.userId,
      clientId,
    });
    if (!pick) return { message: "This Facebook sign-in has expired. Go back and connect Facebook again." };

    const page = (await listManagedPages(pick.userToken, env.META_APP_SECRET)).find((row) => row.id === pageId);
    if (!page) return { message: "That Page is not one you manage on Facebook." };
    if (!page.canPost) return { message: "Your Facebook login cannot create posts on that Page. Ask for full control of it first." };

    await saveOAuthConnection(await getDb(), actor, clientId, "facebook", {
      displayName: page.name,
      externalAccountId: page.id,
      accessTokenEncrypted: encryptToken(page.accessToken, env.TOKEN_ENCRYPTION_KEY),
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      grantedScopes: [...META_SCOPES],
    });
    cookieStore.set(META_PICK_COOKIE, "", { path: `/c/${slug}/accounts`, maxAge: 0 });
    pageName = page.name;
  } catch (error) {
    if (error instanceof MetaApiError) return { message: `Facebook said: ${error.message}` };
    return failure(error);
  }

  revalidatePath(`/c/${slug}/accounts`);
  redirect(`/c/${slug}/accounts?facebook=connected&name=${encodeURIComponent(pageName)}`);
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
