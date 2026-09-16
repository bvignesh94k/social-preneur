"use server";

import { ForbiddenError, InvalidInputError, NotFoundError } from "@sp/core";
import { requireClientBySlug, updateClientSettings } from "@sp/db";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { requireWorkspace } from "@/lib/session";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateClientSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug");
  const values = {
    name: text(formData, "name"),
    website: text(formData, "website"),
    industry: text(formData, "industry"),
    timezone: text(formData, "timezone"),
  };

  try {
    const { actor } = await requireWorkspace();
    const db = await getDb();
    const { client } = await requireClientBySlug(db, actor, "client.assignTeam", slug);

    await updateClientSettings(db, actor, client.id, {
      name: values.name,
      website: values.website || null,
      industry: values.industry || null,
      timezone: values.timezone,
    });
  } catch (error) {
    if (error instanceof InvalidInputError) return { message: error.message, values };
    if (error instanceof ForbiddenError) {
      return { message: "Only agency admins can change client settings.", values };
    }
    if (error instanceof NotFoundError) return { message: "That client no longer exists.", values };
    throw error;
  }

  revalidatePath(`/c/${slug}`, "layout");
  return { ok: true, values };
}
