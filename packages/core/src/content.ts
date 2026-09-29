import type { SocialPlatform } from "./brand";

export const CONTENT_CATEGORIES = [
  "educational",
  "promotional",
  "social_proof",
  "engagement",
  "behind_the_scenes",
  "news",
] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export const POST_STATUSES = [
  "idea",
  "draft",
  "needs_creative",
  "ready",
  "scheduled",
  "published",
  "failed",
  "archived",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const VARIANT_STATUSES = ["pending", "ready", "queued", "published", "failed", "skipped"] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];

export const POST_SOURCES = ["manual", "ai", "trend", "special_day", "repurpose"] as const;
export type PostSource = (typeof POST_SOURCES)[number];

export const IDEA_STATUSES = ["new", "used", "dismissed"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

// A balanced month for a service business: teach first, sell sparingly.
export const DEFAULT_CONTENT_MIX: Record<ContentCategory, number> = {
  educational: 40,
  promotional: 20,
  social_proof: 15,
  engagement: 10,
  behind_the_scenes: 10,
  news: 5,
};

export interface PlatformRules {
  captionLimit: number;
  titleLimit: number | null;
  hashtagsAdvised: number;
  requiresMedia: boolean;
  supportsLink: boolean;
  supportsFirstComment: boolean;
}

// Published platform limits. Hashtag counts are what performs, not what is allowed.
export const PLATFORM_RULES: Record<SocialPlatform, PlatformRules> = {
  linkedin: {
    captionLimit: 3000,
    titleLimit: null,
    hashtagsAdvised: 5,
    requiresMedia: false,
    supportsLink: true,
    supportsFirstComment: true,
  },
  facebook: {
    captionLimit: 63206,
    titleLimit: null,
    hashtagsAdvised: 3,
    requiresMedia: false,
    supportsLink: true,
    supportsFirstComment: true,
  },
  instagram: {
    captionLimit: 2200,
    titleLimit: null,
    hashtagsAdvised: 12,
    requiresMedia: true,
    supportsLink: false,
    supportsFirstComment: true,
  },
  x: {
    captionLimit: 280,
    titleLimit: null,
    hashtagsAdvised: 2,
    requiresMedia: false,
    supportsLink: true,
    supportsFirstComment: false,
  },
  threads: {
    captionLimit: 500,
    titleLimit: null,
    hashtagsAdvised: 1,
    requiresMedia: false,
    supportsLink: true,
    supportsFirstComment: false,
  },
  pinterest: {
    captionLimit: 500,
    titleLimit: 100,
    hashtagsAdvised: 4,
    requiresMedia: true,
    supportsLink: true,
    supportsFirstComment: false,
  },
};

export interface VariantDraft {
  caption: string;
  title?: string | null;
  linkUrl?: string | null;
  hashtags?: string[];
  hasMedia?: boolean;
}

export type IssueLevel = "blocker" | "warning";

export interface VariantIssue {
  level: IssueLevel;
  message: string;
}

// X counts a link as a fixed-length token however long the address is.
const X_LINK_LENGTH = 23;
const LINK_RE = /https?:\/\/\S+/g;

export function countPlatformCharacters(platform: SocialPlatform, caption: string): number {
  const text = caption.trim();
  if (platform !== "x") return [...text].length;
  const shortened = text.replace(LINK_RE, "x".repeat(X_LINK_LENGTH));
  return [...shortened].length;
}

export function checkVariant(platform: SocialPlatform, draft: VariantDraft): VariantIssue[] {
  const rules = PLATFORM_RULES[platform];
  const issues: VariantIssue[] = [];
  const caption = draft.caption.trim();
  const hashtags = draft.hashtags ?? [];

  if (!caption && !rules.requiresMedia) {
    issues.push({ level: "blocker", message: "The caption is empty." });
  }

  const length = countPlatformCharacters(platform, caption);
  if (length > rules.captionLimit) {
    issues.push({
      level: "blocker",
      message: `The caption is ${length} characters, ${length - rules.captionLimit} over the ${rules.captionLimit} limit.`,
    });
  }

  if (rules.requiresMedia && !draft.hasMedia) {
    issues.push({ level: "blocker", message: "Needs an image or video. Add one under Image or video." });
  }

  if (rules.titleLimit && draft.title && [...draft.title.trim()].length > rules.titleLimit) {
    issues.push({ level: "blocker", message: `The title is over the ${rules.titleLimit} character limit.` });
  }

  if (draft.linkUrl && !rules.supportsLink) {
    issues.push({
      level: "warning",
      message: "Links in the caption are not clickable here, so put it in the profile or the first comment.",
    });
  }

  if (hashtags.length > rules.hashtagsAdvised) {
    issues.push({
      level: "warning",
      message: `${hashtags.length} hashtags is more than the ${rules.hashtagsAdvised} that usually perform here.`,
    });
  }

  return issues;
}

export function hasBlocker(issues: VariantIssue[]): boolean {
  return issues.some((issue) => issue.level === "blocker");
}

export interface MixRow {
  category: ContentCategory;
  target: number;
  planned: number;
  share: number;
  drift: number;
}

// Compares a month's planned posts against the client's target mix.
export function compareMix(
  counts: Partial<Record<ContentCategory, number>>,
  targets: Partial<Record<ContentCategory, number>> = DEFAULT_CONTENT_MIX,
): MixRow[] {
  const total = CONTENT_CATEGORIES.reduce((sum, category) => sum + (counts[category] ?? 0), 0);

  return CONTENT_CATEGORIES.map((category) => {
    const planned = counts[category] ?? 0;
    const target = targets[category] ?? 0;
    const share = total === 0 ? 0 : Math.round((planned / total) * 100);
    return { category, target, planned, share, drift: total === 0 ? 0 : share - target };
  });
}

// Worth telling the user about only when the gap is big enough to act on.
export const MIX_DRIFT_TOLERANCE = 10;

export function mixWarnings(rows: MixRow[]): string[] {
  return rows
    .filter((row) => Math.abs(row.drift) > MIX_DRIFT_TOLERANCE)
    .map((row) =>
      row.drift > 0
        ? `${CATEGORY_LABELS[row.category]} is ${row.drift} points above target at ${row.share} percent.`
        : `${CATEGORY_LABELS[row.category]} is ${Math.abs(row.drift)} points below target at ${row.share} percent.`,
    );
}

export const CATEGORY_LABELS: Record<ContentCategory, string> = {
  educational: "Educational",
  promotional: "Promotional",
  social_proof: "Social proof",
  engagement: "Engagement",
  behind_the_scenes: "Behind the scenes",
  news: "News",
};

export const STATUS_LABELS: Record<PostStatus, string> = {
  idea: "Idea",
  draft: "Draft",
  needs_creative: "Needs creative",
  ready: "Ready",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
  archived: "Archived",
};

// ---------- Media ----------

export const MEDIA_KINDS = ["image", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

// What the upload box accepts. Every platform the app posts to takes these.
export const MEDIA_CONTENT_TYPES: Record<string, MediaKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/quicktime": "video",
};
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_MEDIA_PER_POST = 10;

export function mediaKindFor(contentType: string): MediaKind | null {
  return MEDIA_CONTENT_TYPES[contentType] ?? null;
}

// Platforms the publisher can post on its own, and which media it can carry
// there. Only a single image goes out automatically for now; video and
// multi-image posts stay manual until each platform's upload flow is built.
export const AUTO_PUBLISH_PLATFORMS: readonly SocialPlatform[] = ["linkedin", "facebook", "threads"];
export const AUTO_SINGLE_IMAGE_PLATFORMS: readonly SocialPlatform[] = ["facebook", "threads"];

export type AutoPublishSupport = "automatic" | "manual_media" | "manual_platform";

export function autoPublishSupport(platform: SocialPlatform, media: { kind: MediaKind }[]): AutoPublishSupport {
  if (!AUTO_PUBLISH_PLATFORMS.includes(platform)) return "manual_platform";
  if (media.length === 0) return "automatic";
  if (AUTO_SINGLE_IMAGE_PLATFORMS.includes(platform) && media.length === 1 && media[0]!.kind === "image") return "automatic";
  return "manual_media";
}

// Turns an uploaded file name into something safe for a storage path, keeping
// the extension so the file is served with the right type.
export function safeMediaFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "";
  return `${base || "file"}${ext ? `.${ext}` : ""}`;
}
