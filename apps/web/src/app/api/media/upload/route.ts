import { MAX_VIDEO_BYTES, MEDIA_CONTENT_TYPES } from "@sp/core";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { mediaStorage } from "@/server/media";
import { UploadRefused, authorizeUpload } from "@/server/media-access";

// Hands the browser a short-lived token to upload one file straight to Vercel
// Blob. Files go directly from the browser to storage, so videos are not held
// back by the size limit on requests to the app itself. The file is attached
// to the post afterwards, by a separate call that checks it again.
export async function POST(request: Request): Promise<Response> {
  if (mediaStorage() !== "blob") {
    return NextResponse.json({ error: "Media storage is not set up yet." }, { status: 503 });
  }

  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = JSON.parse(clientPayload ?? "{}") as { slug?: unknown; postId?: unknown };
        const { prefix } = await authorizeUpload(payload.slug, payload.postId);
        if (!pathname.startsWith(prefix) || pathname.includes("..")) {
          throw new UploadRefused("That file is not going into this post's folder.");
        }
        return {
          allowedContentTypes: Object.keys(MEDIA_CONTENT_TYPES),
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof UploadRefused ? error.message : "The upload could not be started.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
