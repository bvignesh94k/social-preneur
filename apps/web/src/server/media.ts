import "server-only";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del } from "@vercel/blob";

// Where uploaded images and videos are kept. Production uses Vercel Blob,
// which gives each file a public address the platforms can fetch. Local
// development without a Blob token writes into public/uploads instead, so
// the upload flow can be tried without an account; those addresses are
// localhost, so nothing uploaded that way can be published.
export type MediaStorage = "blob" | "local" | "off";

export function mediaStorage(): MediaStorage {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  return process.env.NODE_ENV === "production" ? "off" : "local";
}

// Every file for a post lives under its client and post, so an upload can be
// checked against the post it claims to belong to.
export function mediaPrefix(clientId: string, postId: string): string {
  return `clients/${clientId}/posts/${postId}/`;
}

// A read-write token looks like vercel_blob_rw_<storeId>_<secret>, and the
// store's public files are served from <storeId>.public.blob.vercel-storage.com.
function blobHost(): string | null {
  const match = /^vercel_blob_rw_([a-z0-9]+)_/i.exec(process.env.BLOB_READ_WRITE_TOKEN ?? "");
  return match ? `${match[1]!.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

const LOCAL_ROOT = path.join(process.cwd(), "public", "uploads");

export function localMediaUrl(pathname: string): string {
  return `/uploads/${pathname}`;
}

// Confirms an address the browser reports after uploading really is a file
// in this app's storage, under this post's own folder.
export function isOwnMediaUrl(url: string, pathname: string, clientId: string, postId: string): boolean {
  if (!pathname.startsWith(mediaPrefix(clientId, postId)) || pathname.includes("..")) return false;

  const storage = mediaStorage();
  if (storage === "local") return url === localMediaUrl(pathname);
  if (storage !== "blob") return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = blobHost();
  const hostOk = host ? parsed.hostname === host : parsed.hostname.endsWith(".public.blob.vercel-storage.com");
  return parsed.protocol === "https:" && hostOk && decodeURIComponent(parsed.pathname) === `/${pathname}`;
}

export async function saveLocalMedia(pathname: string, file: File): Promise<void> {
  const target = path.join(LOCAL_ROOT, pathname);
  if (!target.startsWith(LOCAL_ROOT + path.sep)) throw new Error("Refusing to write outside the uploads folder.");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()));
}

// Best effort: a file left behind costs a little storage, while failing the
// removal the person asked for would be worse.
export async function deleteStoredMedia(url: string, pathname: string): Promise<void> {
  try {
    if (mediaStorage() === "blob") {
      await del(url);
    } else if (mediaStorage() === "local") {
      const target = path.join(LOCAL_ROOT, pathname);
      if (target.startsWith(LOCAL_ROOT + path.sep)) await unlink(target);
    }
  } catch {
    // Left for a later cleanup.
  }
}
