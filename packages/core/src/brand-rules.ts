import { InvalidInputError } from "./errors";

export const BRAND_RULE_TYPES = [
  "max_hashtags",
  "no_emojis",
  "blocked_phrase",
  "required_phrase",
  "no_weekend_posts",
  "custom",
] as const;
export type BrandRuleType = (typeof BRAND_RULE_TYPES)[number];

export interface BrandRuleValues {
  max_hashtags: { max: number };
  no_emojis: Record<string, never>;
  blocked_phrase: { phrase: string };
  required_phrase: { phrase: string };
  no_weekend_posts: Record<string, never>;
  custom: { instruction: string };
}

// A client can hold at most one rule of each of these types.
export const SINGLE_USE_RULE_TYPES = ["max_hashtags", "no_emojis", "no_weekend_posts"] as const satisfies readonly BrandRuleType[];

function readText(value: unknown, key: string, label: string, maxLength: number): string {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
  const text = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!text) throw new InvalidInputError(`Enter the ${label}.`);
  if (text.length > maxLength) throw new InvalidInputError(`Keep the ${label} under ${maxLength} characters.`);
  return text;
}

export function normalizeRuleValue<T extends BrandRuleType>(type: T, value: unknown): BrandRuleValues[T] {
  switch (type) {
    case "max_hashtags": {
      const raw = typeof value === "object" && value !== null ? (value as { max?: unknown }).max : undefined;
      const max = typeof raw === "number" ? raw : Number(raw);
      if (raw === "" || !Number.isInteger(max) || max < 0 || max > 30) {
        throw new InvalidInputError("Choose a hashtag limit between 0 and 30.");
      }
      return { max } as BrandRuleValues[T];
    }
    case "blocked_phrase":
    case "required_phrase":
      return { phrase: readText(value, "phrase", "phrase", 80) } as BrandRuleValues[T];
    case "custom":
      return { instruction: readText(value, "instruction", "instruction", 280) } as BrandRuleValues[T];
    case "no_emojis":
    case "no_weekend_posts":
      return {} as BrandRuleValues[T];
    default:
      throw new InvalidInputError("Choose a rule type.");
  }
}

export function describeRule(type: BrandRuleType, value: unknown): string {
  const v = (value ?? {}) as Partial<{ max: number; phrase: string; instruction: string }>;
  switch (type) {
    case "max_hashtags":
      return v.max === 0 ? "Do not use hashtags." : `Use at most ${v.max} hashtag${v.max === 1 ? "" : "s"}.`;
    case "no_emojis":
      return "Do not use emojis.";
    case "blocked_phrase":
      return `Never use the phrase "${v.phrase}".`;
    case "required_phrase":
      return `Always include "${v.phrase}".`;
    case "no_weekend_posts":
      return "Do not schedule posts on Saturdays or Sundays.";
    case "custom":
      return v.instruction ?? "";
  }
}
