import { randomBytes } from "node:crypto";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, mediaKindFor, safeMediaFileName } from "@sp/core";
import { NextResponse } from "next/server";
import { localMediaUrl, mediaStorage, saveLocalMedia } from "@/server/media";
import { UploadRefused, authorizeUpload } from "@/server/media-access";

// Development stand-in for Vercel Blob: stores the file under public/uploads.
// Unavailable wherever Blob is configured, and in production at all.
export async function POST(request: Request): Promise<Response> {
  if (mediaStorage() !== "local") return NextResponse.json({ error: "Not available." }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file was sent." }, { status: 400 });

  const kind = mediaKindFor(file.type);
  if (!kind) return NextResponse.json({ error: "Use a JPG, PNG or WebP image, or an MP4 or MOV video." }, { status: 400 });
  if (file.size > (kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) {
    return NextResponse.json({ error: "That file is too large." }, { status: 400 });
  }

  let prefix: string;
  try {
    ({ prefix } = await authorizeUpload(form.get("slug"), form.get("postId")));
  } catch (error) {
    if (error instanceof UploadRefused) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }

  // The folder comes from the server's own check, never from the browser.
  const name = safeMediaFileName(file.name);
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  const pathname = `${prefix}${base}-${randomBytes(4).toString("hex")}${ext}`;
  await saveLocalMedia(pathname, file);

  return NextResponse.json({ url: localMediaUrl(pathname), pathname, contentType: file.type });
}
