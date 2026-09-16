import { describe, expect, it } from "vitest";
import { describeRule, normalizeRuleValue } from "./brand-rules";
import { InvalidInputError } from "./errors";

describe("normalizeRuleValue", () => {
  it("accepts hashtag limits from 0 to 30, including form strings", () => {
    expect(normalizeRuleValue("max_hashtags", { max: "5" })).toEqual({ max: 5 });
    expect(normalizeRuleValue("max_hashtags", { max: 0 })).toEqual({ max: 0 });
  });

  it("rejects invalid hashtag limits", () => {
    for (const max of [-1, 31, 2.5, "", "five", undefined]) {
      expect(() => normalizeRuleValue("max_hashtags", { max })).toThrow(InvalidInputError);
    }
  });

  it("trims phrases and requires them", () => {
    expect(normalizeRuleValue("blocked_phrase", { phrase: "  cheapest   price " })).toEqual({ phrase: "cheapest price" });
    expect(() => normalizeRuleValue("required_phrase", { phrase: "   " })).toThrow("Enter the phrase.");
    expect(() => normalizeRuleValue("custom", { instruction: "x".repeat(281) })).toThrow(InvalidInputError);
  });

  it("stores no value for on/off rules", () => {
    expect(normalizeRuleValue("no_emojis", { anything: true })).toEqual({});
  });
});

describe("describeRule", () => {
  it("writes rules as plain instructions", () => {
    expect(describeRule("max_hashtags", { max: 1 })).toBe("Use at most 1 hashtag.");
    expect(describeRule("max_hashtags", { max: 0 })).toBe("Do not use hashtags.");
    expect(describeRule("blocked_phrase", { phrase: "guaranteed" })).toBe('Never use the phrase "guaranteed".');
    expect(describeRule("custom", { instruction: "Use formal English." })).toBe("Use formal English.");
  });
});
