import type { MediaKind } from "@sp/core";

// A rough picture of how the post reads in a feed, so the caption and image
// can be judged together before scheduling. Not any one platform's layout.
export function PostPreview({
  name,
  caption,
  hashtags,
  media,
}: {
  name: string;
  caption: string;
  hashtags: string[];
  media: { url: string; kind: MediaKind }[];
}) {
  const [first] = media;
  const tags = hashtags.filter((tag) => !caption.toLowerCase().includes(`#${tag.toLowerCase()}`));

  return (
    <section className="grid gap-3 rounded-xl border border-line bg-surface p-5">
      <h2 className="font-display text-base font-bold">Preview</h2>
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span aria-hidden className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="text-sm font-semibold">{name}</span>
        </div>

        {caption || tags.length > 0 ? (
          <p className="whitespace-pre-line break-words px-3 pb-3 text-sm">
            {caption}
            {tags.length > 0 && (
              <span className="text-info">
                {caption ? "\n\n" : ""}
                {tags.map((tag) => `#${tag}`).join(" ")}
              </span>
            )}
          </p>
        ) : (
          <p className="px-3 pb-3 text-sm italic text-muted">Your caption shows here.</p>
        )}

        {first ? (
          <div className="relative bg-sunk">
            {first.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={first.url} alt="" className="max-h-80 w-full object-cover" />
            ) : (
              <video src={first.url} className="max-h-80 w-full object-cover" muted playsInline controls preload="metadata" />
            )}
            {media.length > 1 && (
              <span className="absolute right-2 top-2 rounded-full bg-ink/75 px-2 py-0.5 text-xs font-medium text-surface">
                1/{media.length}
              </span>
            )}
          </div>
        ) : (
          <div className="grid h-24 place-items-center border-t border-dashed border-line bg-sunk/40 text-xs text-muted">
            No image or video
          </div>
        )}
      </div>
    </section>
  );
}
