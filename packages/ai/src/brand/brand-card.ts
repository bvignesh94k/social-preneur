import { createHash } from "node:crypto";
import { z } from "zod";

export const BrandCardDraftSchema = z.object({
  summary: z.string(),
  audience: z.string(),
  voice: z.string(),
  offerings: z.array(z.string()),
  avoid: z.array(z.string()),
});

export type BrandCardDraft = z.infer<typeof BrandCardDraftSchema>;

// Proof points and rules are copied from verified data, never written by the model.
export interface BrandCard extends BrandCardDraft {
  proofPoints: string[];
  rules: string[];
}

export interface BrandCardInput {
  clientName: string;
  industry: string | null;
  contentLanguage: "en" | "ta" | "en_ta";
  profile: {
    description: string | null;
    targetAudience: string | null;
    targetLocations: string[];
    usps: string[];
    toneOfVoice: string[];
    contentStyle: string | null;
    primaryCta: string | null;
    preferredHashtags: string[];
    wordsToAvoid: string[];
  };
  offerings: { kind: "product" | "service"; name: string; summary: string | null; benefits: string[] }[];
  verifiedFacts: string[];
  rules: string[];
}

export const BRAND_CARD_SYSTEM = [
  "You write a compact brand briefing that another AI will read before writing social media posts for this client.",
  "Rules:",
  "- Use only the information provided. Do not add claims, numbers, awards, results or products.",
  "- summary: what the business does and for whom, under 80 words.",
  "- audience: who the posts are for, under 40 words.",
  "- voice: how posts should sound, based on the tone and style notes, under 40 words.",
  "- offerings: one short line per product or service provided.",
  "- avoid: words, phrases and topics to avoid, taken from the information provided.",
  "- Do not use em dashes.",
].join("\n");

export function buildBrandCardPrompt(input: BrandCardInput): string {
  const { verifiedFacts: _facts, rules: _rules, ...context } = input;
  return `Write the brand briefing from this information:\n${JSON.stringify(context, null, 2)}`;
}

export function brandCardInputHash(input: BrandCardInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function assembleBrandCard(draft: BrandCardDraft, input: BrandCardInput): BrandCard {
  return { ...draft, proofPoints: input.verifiedFacts, rules: input.rules };
}
