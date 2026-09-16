import type { AgencyRole, BrandRuleType, ClientRole, FactKind, SocialPlatform } from "@sp/core";

export const OFFERING_KIND_LABEL = { product: "Product", service: "Service" } as const;

export const FACT_KIND_LABEL: Record<FactKind, string> = {
  statistic: "Statistic",
  certification: "Certification",
  award: "Award",
  specification: "Product specification",
  testimonial: "Testimonial",
  client_result: "Client result",
  other: "Other",
};

export const SOCIAL_PLATFORM_LABEL: Record<SocialPlatform, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  threads: "Threads",
  pinterest: "Pinterest",
};

export const RULE_TYPE_LABEL: Record<BrandRuleType, string> = {
  max_hashtags: "Hashtag limit",
  no_emojis: "No emojis",
  blocked_phrase: "Blocked phrase",
  required_phrase: "Required phrase",
  no_weekend_posts: "No weekend posts",
  custom: "Custom instruction",
};

export function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}

export const AGENCY_ROLE_LABEL: Record<AgencyRole, string> = {
  super_admin: "Super Admin",
  agency_admin: "Agency Admin",
  manager: "Social Media Manager",
  writer: "Content Writer",
  designer: "Designer",
  client_user: "Client",
};

export const CLIENT_ROLE_LABEL: Record<ClientRole, string> = {
  staff: "Team",
  client_approver: "Client Approver",
  client_viewer: "Client Viewer",
};

export const LANGUAGE_LABEL = {
  en: "English",
  ta: "Tamil",
  en_ta: "English and Tamil",
} as const;

export const CLIENT_STATUS_LABEL = {
  onboarding: "Setting up",
  active: "Active",
  archived: "Archived",
} as const;

export const APPROVAL_MODE_LABEL = {
  internal_only: "Internal review only",
  internal_and_client: "Internal and client review",
} as const;

export function formatMinutes(minutes: number): string {
  if (minutes % 60 !== 0) return `${minutes} minutes`;
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
