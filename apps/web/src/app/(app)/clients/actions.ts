"use server";

import { ForbiddenError, InvalidInputError } from "@sp/core";
import { createClient } from "@sp/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";

const CreateClientSchema = z.object({
  name: z.string().trim().min(2, "Enter the client's name.").max(120, "Keep the name under 120 characters."),
  website: z
    .union([
      z.literal(""),
      z.url({ protocol: /^https?$/, error: "Enter a full web address, for example https://example.com" }),
    ])
    .transform((value) => value || null),
  industry: z
    .string()
    .trim()
    .max(80, "Keep the industry under 80 characters.")
    .transform((value) => value || null),
  defaultLanguage: z.enum(["en", "ta", "en_ta"], "Choose a content language."),
});

type Field = keyof z.input<typeof CreateClientSchema>;

export type CreateClientState =
  | { errors?: Partial<Record<Field, string>>; message?: string; values: Record<Field, string> }
  | undefined;

export async function createClientAction(_prev: CreateClientState, formData: FormData): Promise<CreateClientState> {
  const { actor } = await requireWorkspace();

  const values: Record<Field, string> = {
    name: String(formData.get("name") ?? ""),
    website: String(formData.get("website") ?? "").trim(),
    industry: String(formData.get("industry") ?? ""),
    defaultLanguage: String(formData.get("defaultLanguage") ?? "en"),
  };

  const parsed = CreateClientSchema.safeParse(values);
  if (!parsed.success) {
    const errors: Partial<Record<Field, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as Field | undefined;
      if (key && !errors[key]) errors[key] = issue.message;
    }
    return { errors, values };
  }

  let slug: string;
  try {
    const client = await createClient(await getDb(), actor, parsed.data);
    slug = client.slug;
  } catch (error) {
    if (error instanceof ForbiddenError) return { message: "Only agency admins can add clients.", values };
    if (error instanceof InvalidInputError) return { message: error.message, values };
    throw error;
  }

  revalidatePath("/", "layout");
  redirect(`/c/${slug}`);
}
