import { CONTENT_CATEGORIES, type ContentCategory } from "@sp/core";
import { z } from "zod";
import type { BrandCard } from "../brand/brand-card";

export const IdeaDraftSchema = z.object({
  hook: z.string(),
  concept: z.string(),
  angle: z.string(),
  category: z.enum(CONTENT_CATEGORIES),
});

export const IdeasDraftSchema = z.object({
  ideas: z.array(IdeaDraftSchema),
});

export type IdeaDraft = z.infer<typeof IdeaDraftSchema>;
export type IdeasDraft = z.infer<typeof IdeasDraftSchema>;

export interface IdeasInput {
  brandCard: BrandCard;
  language: "en" | "ta" | "en_ta";
  count: number;
  // Categories the month is short of, so the ideas fill the real gaps.
  wantedCategories: ContentCategory[];
  // Titles and hooks this client has already used, which the ideas must not repeat.
  alreadyCovered: string[];
  // Products or services that have gone a long time without a mention.
  neglectedOfferings: string[];
  occasion: string | null;
}

const LANGUAGE_NOTE: Record<IdeasInput["language"], string> = {
  en: "Write in English.",
  ta: "Write in Tamil.",
  en_ta: "Write in English. The team will translate to Tamil separately.",
};

export const IDEAS_SYSTEM = [
  "You suggest social media post ideas for one client of a small agency.",
  "Rules:",
  "- Use only the briefing provided. Never invent a number, award, certification, client result or product.",
  "- The proof points are the only factual claims available to you. If a proof point does not cover it, do not claim it.",
  "- hook: the opening line a reader would stop for, under 15 words.",
  "- concept: what the post says and why it is worth posting, two sentences at most.",
  "- angle: what makes this different from the ideas already covered, one short sentence.",
  "- category: which of the given categories the idea belongs to.",
  "- Do not repeat anything in the already covered list, including the same point said differently.",
  "- No em dashes. No hashtags in the hook.",
].join("\n");

export function buildIdeasPrompt(input: IdeasInput): string {
  const parts = [
    `Suggest ${input.count} post ideas.`,
    LANGUAGE_NOTE[input.language],
    "",
    "Brand briefing:",
    JSON.stringify(input.brandCard, null, 2),
    "",
    `Categories this month is short of: ${input.wantedCategories.join(", ") || "any"}`,
  ];

  if (input.neglectedOfferings.length > 0) {
    parts.push(
      "",
      `These products or services have not been posted about in a while, so cover at least one: ${input.neglectedOfferings.join(", ")}`,
    );
  }

  if (input.occasion) {
    parts.push("", `One idea should suit this occasion, only if it genuinely fits the business: ${input.occasion}`);
  }

  parts.push(
    "",
    input.alreadyCovered.length > 0
      ? `Already covered, do not repeat these:\n${input.alreadyCovered.map((line) => `- ${line}`).join("\n")}`
      : "Nothing has been posted yet, so start with the basics of what this business does.",
  );

  return parts.join("\n");
}
