interface ListOptions {
  max?: number;
  maxLength?: number;
}

function collect(parts: string[], options: ListOptions): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const item = raw.trim().replace(/\s+/g, " ");
    if (!item) continue;
    const key = item.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(options.maxLength ? item.slice(0, options.maxLength).trim() : item);
    if (options.max && out.length >= options.max) break;
  }
  return out;
}

// For short items like locations or fonts, where commas separate entries.
export function parseList(input: string, options: ListOptions = {}): string[] {
  return collect(input.split(/[\n,]/), options);
}

// For sentences like USPs or benefits, which may contain commas.
export function parseLines(input: string, options: ListOptions = {}): string[] {
  return collect(input.split(/\n/), options);
}

export function normalizeHashtag(tag: string): string | null {
  // \p{M} keeps Tamil vowel signs and viramas, which are combining marks, not letters.
  const body = tag.trim().replace(/^#+/, "").replace(/[^\p{L}\p{M}\p{N}_]/gu, "");
  return body ? `#${body}` : null;
}

export function parseHashtags(input: string, max = 30): string[] {
  const tags = input
    .split(/[\s,]+/)
    .map(normalizeHashtag)
    .filter((tag): tag is string => tag !== null);
  return collect(tags, { max });
}
