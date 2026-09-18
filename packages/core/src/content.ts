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
    issues.push({ level: "blocker", message: "This platform cannot post without an image or video." });
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
