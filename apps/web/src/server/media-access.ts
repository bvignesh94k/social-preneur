import "server-only";
import { ForbiddenError, NotFoundError } from "@sp/core";
import { getPost, requireClientBySlug } from "@sp/db";
import { getDb } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";
import { mediaPrefix } from "./media";

export class UploadRefused extends Error {}

// Everything an upload needs checked before a single byte is stored: the
// person can edit this client's content, and the post is theirs and still
// open. Returns the folder the post's files belong in.
export async function authorizeUpload(slug: unknown, postId: unknown): Promise<{ prefix: string }> {
  if (typeof slug !== "string" || typeof postId !== "string") throw new UploadRefused("Missing post.");

  const { actor } = await requireWorkspace();
  const db = await getDb();
  try {
    const { scope } = await requireClientBySlug(db, actor, "content.edit", slug);
    const post = await getPost(db, scope, postId);
    if (post.status === "published") throw new UploadRefused("This post is already published.");
    return { prefix: mediaPrefix(scope.clientId, post.id) };
  } catch (error) {
    if (error instanceof ForbiddenError) throw new UploadRefused("You do not have permission to add media here.");
    if (error instanceof NotFoundError) throw new UploadRefused("That post no longer exists.");
    throw error;
  }
}
