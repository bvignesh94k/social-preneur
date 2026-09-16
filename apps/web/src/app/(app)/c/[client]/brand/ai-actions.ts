"use server";

import { AiError } from "@sp/ai";
import { ForbiddenError, InvalidInputError, NotFoundError } from "@sp/core";
import { acceptSuggestion, dismissSuggestion, startWebsiteScan } from "@sp/db";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { requireWorkspace } from "@/lib/session";
import { generateBrandCard } from "@/server/brand-card";
import { runWebsiteScan } from "@/server/website-scan";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function refresh(formData: FormData) {
  const slug = text(formData, "slug");
  revalidatePath(/^[a-z0-9-]{1,60}$/.test(slug) ? `/c/${slug}` : "/", "layout");
}

function failure(error: unknown): FormState {
  if (error instanceof InvalidInputError) return { message: error.message };
  if (error instanceof AiError) return { message: error.userMessage };
  if (error instanceof ForbiddenError || error instanceof NotFoundError) {
    return { message: "You do not have permission to make this change." };
  }
  throw error;
}

const ScanUrl = z.url({ protocol: /^https?$/, error: "Enter the full website address, starting with https://" });

export async function startWebsiteScanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireWorkspace();
  const url = text(formData, "url").trim();
  const parsed = ScanUrl.safeParse(url);
  if (!parsed.success) {
    return { errors: { url: parsed.error.issues[0]?.message ?? "Enter a valid address." }, values: { url } };
  }

  let scanId: string;
  try {
    const scan = await startWebsiteScan(await getDb(), actor, text(formData, "clientId"), parsed.data);
    scanId = scan.id;
  } catch (error) {
    return { ...failure(error), values: { url } };
  }

  // The scan continues after this response, so the page can show progress instead of waiting a minute.
  after(() => runWebsiteScan(scanId));
  refresh(formData);
  return { ok: true };
}

export async function acceptSuggestionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireWorkspace();
  try {
    await acceptSuggestion(await getDb(), actor, text(formData, "clientId"), text(formData, "suggestionId"));
  } catch (error) {
    return failure(error);
  }
  refresh(formData);
  return { ok: true };
}

export async function dismissSuggestionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireWorkspace();
  try {
    await dismissSuggestion(await getDb(), actor, text(formData, "clientId"), text(formData, "suggestionId"));
  } catch (error) {
    return failure(error);
  }
  refresh(formData);
  return { ok: true };
}

export async function generateBrandCardAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireWorkspace();
  try {
    await generateBrandCard(actor, text(formData, "clientId"));
  } catch (error) {
    return failure(error);
  }
  refresh(formData);
  return { ok: true };
}
