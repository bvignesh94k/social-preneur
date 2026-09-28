// Adds hashtags the version carries that the caption does not already
// mention, on their own line. Shared by every platform that takes plain text
// with no markup of its own (Facebook, Threads); LinkedIn's little text
// format needs its own escaping on top of this.
export function appendUnusedHashtags(caption: string, hashtags: string[]): string {
  const lowerCaption = caption.toLowerCase();
  const tags = hashtags
    .map((tag) => tag.replace(/[^\p{L}\p{M}\p{N}]/gu, ""))
    .filter((tag) => /\p{L}/u.test(tag) && !lowerCaption.includes(`#${tag.toLowerCase()}`));
  const parts = [caption.trim()];
  if (tags.length > 0) parts.push([...new Set(tags)].map((tag) => `#${tag}`).join(" "));
  return parts.filter(Boolean).join("\n\n");
}
