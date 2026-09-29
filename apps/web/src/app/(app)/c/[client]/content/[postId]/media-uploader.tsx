"use client";

import {
  MAX_IMAGE_BYTES,
  MAX_MEDIA_PER_POST,
  MAX_VIDEO_BYTES,
  MEDIA_CONTENT_TYPES,
  mediaKindFor,
  safeMediaFileName,
} from "@sp/core";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ActionButton } from "@/components/action-button";
import { attachMediaAction, removeMediaAction } from "../actions";

export interface MediaItem {
  id: string;
  kind: "image" | "video";
  url: string;
  fileName: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
}

interface Uploading {
  key: string;
  name: string;
  percent: number;
  error: string | null;
}

const ACCEPT = Object.keys(MEDIA_CONTENT_TYPES).join(",");

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

// Width and height help spot a photo Instagram would crop badly. Best effort:
// a file the browser cannot read still uploads.
async function measure(file: File): Promise<{ width: number | null; height: number | null }> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("unreadable"));
    });
    return { width: video.videoWidth || null, height: video.videoHeight || null };
  } catch {
    return { width: null, height: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function problemWith(file: File): string | null {
  const kind = mediaKindFor(file.type);
  if (!kind) return "Use a JPG, PNG or WebP image, or an MP4 or MOV video.";
  const limit = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > limit) return `Too large: ${megabytes(file.size)}. The limit for ${kind}s is ${megabytes(limit)}.`;
  return null;
}

export function MediaUploader({
  slug,
  postId,
  storage,
  prefix,
  media,
  readOnly,
}: {
  slug: string;
  postId: string;
  storage: "blob" | "local" | "off";
  prefix: string;
  media: MediaItem[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Uploading[]>([]);
  const [dragging, setDragging] = useState(false);
  const [, startTransition] = useTransition();

  const room = MAX_MEDIA_PER_POST - media.length - uploads.filter((u) => !u.error).length;
  const canAdd = !readOnly && storage !== "off" && room > 0;

  const update = (key: string, patch: Partial<Uploading>) =>
    setUploads((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  async function send(file: File) {
    const key = `${file.name}-${file.size}-${Math.random()}`;
    const problem = problemWith(file);
    setUploads((list) => [...list, { key, name: file.name, percent: 0, error: problem }]);
    if (problem) return;

    try {
      const size = await measure(file);
      let stored: { url: string; pathname: string };

      if (storage === "blob") {
        const blob = await upload(`${prefix}${safeMediaFileName(file.name)}`, file, {
          access: "public",
          handleUploadUrl: "/api/media/upload",
          clientPayload: JSON.stringify({ slug, postId }),
          contentType: file.type,
          multipart: file.size > 20 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => update(key, { percent: Math.round(percentage) }),
        });
        stored = { url: blob.url, pathname: blob.pathname };
      } else {
        const form = new FormData();
        form.set("file", file);
        form.set("slug", slug);
        form.set("postId", postId);
        const response = await fetch("/api/media/local", { method: "POST", body: form });
        const body = (await response.json()) as { url?: string; pathname?: string; error?: string };
        if (!response.ok || !body.url || !body.pathname) throw new Error(body.error ?? "The upload failed.");
        stored = { url: body.url, pathname: body.pathname };
      }

      update(key, { percent: 100 });
      const result = await attachMediaAction({
        slug,
        postId,
        url: stored.url,
        pathname: stored.pathname,
        contentType: file.type,
        sizeBytes: file.size,
        width: size.width,
        height: size.height,
        fileName: file.name,
      });
      if (result?.message) throw new Error(result.message);

      setUploads((list) => list.filter((item) => item.key !== key));
      startTransition(() => router.refresh());
    } catch (error) {
      update(key, { error: error instanceof Error ? error.message : "The upload failed. Try again." });
    }
  }

  function take(files: FileList | null) {
    if (!files || !canAdd) return;
    [...files].slice(0, Math.max(room, 0)).forEach((file) => void send(file));
  }

  return (
    <div className="grid gap-3">
      {storage === "off" && (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          Uploads are not switched on yet. Media storage needs to be connected on the server.
        </p>
      )}

      {(media.length > 0 || uploads.length > 0) && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((item, index) => (
            <li key={item.id} className="group relative overflow-hidden rounded-lg border border-line bg-sunk">
              <div className="aspect-square">
                {item.kind === "image" ? (
                  // Stored files come from blob storage, which the image optimizer is not set up for.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={item.fileName ?? `Image ${index + 1}`} className="size-full object-cover" />
                ) : (
                  <video src={item.url} className="size-full object-cover" muted playsInline preload="metadata" />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line bg-surface px-2 py-1.5">
                <span className="min-w-0 truncate text-xs text-muted" title={item.fileName ?? undefined}>
                  {index === 0 && media.length > 1 ? "Cover · " : ""}
                  {item.kind === "video" ? "Video" : "Image"}
                  {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
                </span>
                <a
                  href={item.url}
                  download={item.fileName ?? true}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-accent hover:underline"
                >
                  Download
                </a>
              </div>
              {!readOnly && (
                <div className="absolute right-1.5 top-1.5">
                  <ActionButton
                    action={removeMediaAction}
                    fields={{ slug, postId, mediaId: item.id }}
                    pendingText="…"
                    className="rounded-full bg-ink/75 px-2 py-0.5 text-xs font-medium text-surface hover:bg-crit"
                  >
                    Remove
                  </ActionButton>
                </div>
              )}
            </li>
          ))}

          {uploads.map((item) => (
            <li key={item.key} className="grid aspect-square content-center gap-2 rounded-lg border border-dashed border-line p-3">
              <span className="truncate text-xs font-medium">{item.name}</span>
              {item.error ? (
                <>
                  <span role="alert" className="text-xs text-crit">
                    {item.error}
                  </span>
                  <button
                    type="button"
                    onClick={() => setUploads((list) => list.filter((u) => u.key !== item.key))}
                    className="justify-self-start text-xs font-medium text-muted hover:text-ink"
                  >
                    Dismiss
                  </button>
                </>
              ) : (
                <>
                  <span className="h-1.5 overflow-hidden rounded-full bg-sunk">
                    <span className="block h-full bg-accent transition-all" style={{ width: `${Math.max(item.percent, 4)}%` }} />
                  </span>
                  <span className="text-xs text-muted">{item.percent < 100 ? `Uploading ${item.percent}%` : "Saving..."}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            take(event.dataTransfer.files);
          }}
          className={`grid place-items-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragging ? "border-accent bg-accent-soft" : "border-line hover:border-accent hover:bg-sunk/50"
          }`}
        >
          <span aria-hidden className="text-2xl leading-none text-accent">
            +
          </span>
          <span className="text-sm font-medium">
            {media.length === 0 ? "Add an image or video" : "Add another"}
          </span>
          <span className="text-xs text-muted">
            Drag files here or click to choose. JPG, PNG, WebP up to {megabytes(MAX_IMAGE_BYTES)} · MP4, MOV up to{" "}
            {megabytes(MAX_VIDEO_BYTES)}
          </span>
        </button>
      )}

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
