import { PLATFORM_RULES, SOCIAL_PLATFORMS, type SocialPlatform } from "@sp/core";
import { z } from "zod";
import type { BrandCard } from "../brand/brand-card";

export const PlatformVersionSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  caption: z.string(),
  hashtags: z.array(z.string()),
  title: z.string(),
  firstComment: z.string(),
});

export const PlatformVersionsDraftSchema = z.object({
  versions: z.array(PlatformVersionSchema),
  creativeBrief: z.string(),
  imagePrompt: z.string(),
});

export type PlatformVersionDraft = z.infer<typeof PlatformVersionSchema>;
export type PlatformVersionsDraft = z.infer<typeof PlatformVersionsDraftSchema>;

export interface CaptionsInput {
  brandCard: BrandCard;
  language: "en" | "ta" | "en_ta";
  post: {
    title: string;
    category: string;
    caption: string | null;
    notes: string | null;
    offering: string | null;
  };
  platforms: SocialPlatform[];
  linkUrl: string | null;
}

const LANGUAGE_NOTE: Record<CaptionsInput["language"], string> = {
  en: "Write in English.",
  ta: "Write in Tamil.",
  en_ta: "Write in English, with the occasional Tamil phrase only where it reads naturally.",
};

export const CAPTIONS_SYSTEM = [
  "You write the platform versions of one social media post for a client of a small agency.",
  "Rules:",
  "- Use only the briefing and the post provided. Never invent a number, award, certification, client result or product.",
  "- The proof points are the only factual claims available to you. If a proof point does not cover it, do not claim it.",
  "- Write each platform in the way people actually read it there. Do not paste the same text everywhere.",
  "- Stay inside the character limit given for each platform. Shorter is usually better.",
  "- hashtags: no leading hash, no more than the number given for that platform.",
  "- title: only for platforms that were given a title limit, otherwise an empty string.",
  "- firstComment: only where it is useful, otherwise an empty string.",
  "- creativeBrief: what the image or video should show, for a designer to work from.",
  "- imagePrompt: the same idea written for an image generator, one sentence.",
  "- Follow the voice and obey every rule in the briefing. No em dashes.",
].join("\n");

export function buildCaptionsPrompt(input: CaptionsInput): string {
  const platformGuide = input.platforms.map((platform) => {
    const rules = PLATFORM_RULES[platform];
    const notes = [
      `caption limit ${rules.captionLimit} characters`,
      `at most ${rules.hashtagsAdvised} hashtags`,
      rules.titleLimit ? `title up to ${rules.titleLimit} characters` : "no title",
      rules.requiresMedia ? "an image is required" : "an image is optional",
      rules.supportsLink ? "links are clickable" : "links are not clickable, so do not put one in the caption",
      rules.supportsFirstComment ? "a first comment is supported" : "no first comment",
    ];
    return `- ${platform}: ${notes.join(", ")}`;
  });

  return [
    `Write the versions for: ${input.platforms.join(", ")}.`,
    LANGUAGE_NOTE[input.language],
    "",
    "Platform rules:",
    ...platformGuide,
    "",
    "The post:",
    JSON.stringify(input.post, null, 2),
    input.linkUrl ? `\nLink to include where clickable: ${input.linkUrl}` : "",
    "",
    "Brand briefing:",
    JSON.stringify(input.brandCard, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

export interface RepurposeInput extends CaptionsInput {
  sourcePlatform: SocialPlatform;
  sourceCaption: string;
}

export const REPURPOSE_SYSTEM = [
  CAPTIONS_SYSTEM,
  "- You are rewriting one post that already exists for other platforms. Keep its point and its facts, change the shape.",
].join("\n");

export function buildRepurposePrompt(input: RepurposeInput): string {
  return [
    `Rewrite this ${input.sourcePlatform} post for: ${input.platforms.join(", ")}.`,
    "",
    "The existing post:",
    input.sourceCaption,
    "",
    buildCaptionsPrompt(input),
  ].join("\n");
}
