"use server";

import { ForbiddenError, NotFoundError } from "@sp/core";
import { setClientPublishingPaused } from "@sp/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";

export type PauseState = { error?: string } | undefined;

const PauseSchema = z.object({
  clientId: z.uuid(),
  paused: z.enum(["true", "false"]),
});

export async function setPublishingPausedAction(_prev: PauseState, formData: FormData): Promise<PauseState> {
  const { actor } = await requireWorkspace();

  const parsed = PauseSchema.safeParse({ clientId: formData.get("clientId"), paused: formData.get("paused") });
  if (!parsed.success) return { error: "This request was not valid. Reload the page and try again." };

  try {
    const client = await setClientPublishingPaused(await getDb(), actor, parsed.data.clientId, parsed.data.paused === "true");
    revalidatePath(`/c/${client.slug}`);
    revalidatePath("/", "layout");
    return undefined;
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) {
      return { error: "You do not have permission to change publishing for this client." };
    }
    throw error;
  }
}
