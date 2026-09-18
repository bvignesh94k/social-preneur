export const OFFERING_KINDS = ["product", "service"] as const;
export type OfferingKind = (typeof OFFERING_KINDS)[number];

export const FACT_KINDS = [
  "statistic",
  "certification",
  "award",
  "specification",
  "testimonial",
  "client_result",
  "other",
] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const FACT_STATUSES = ["unverified", "verified", "rejected"] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

export const TONE_PRESETS = [
  "Professional",
  "Friendly",
  "Conversational",
  "Educational",
  "Bold",
  "Premium",
  "Technical",
  "Executive",
  "Warm",
  "Witty",
] as const;

export const SOCIAL_PLATFORMS = ["linkedin", "facebook", "instagram", "x", "threads", "pinterest"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type SocialLinks = Partial<Record<SocialPlatform, string>>;

export interface BrandColor {
  name: string;
  hex: string;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}
