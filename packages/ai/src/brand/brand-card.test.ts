import { describe, expect, it } from "vitest";
import { assembleBrandCard, brandCardInputHash, buildBrandCardPrompt, type BrandCardInput } from "./brand-card";

const input: BrandCardInput = {
  clientName: "Kaveri Industrial Labels",
  industry: "Manufacturing",
  contentLanguage: "en_ta",
  profile: {
    description: "Thermal labels for factories.",
    targetAudience: "Plant managers",
    targetLocations: ["Coimbatore"],
    usps: [],
    toneOfVoice: ["Professional"],
    contentStyle: null,
    primaryCta: "Request a sample",
    preferredHashtags: [],
    wordsToAvoid: ["cheapest"],
  },
  offerings: [{ kind: "product", name: "Thermal transfer labels", summary: null, benefits: [] }],
  verifiedFacts: ["ISO 9001:2015 certified since 2018"],
  rules: ["Use at most 5 hashtags."],
};

describe("brand card", () => {
  it("copies proof points and rules from verified data instead of the model's draft", () => {
    const card = assembleBrandCard(
      { summary: "S", audience: "A", voice: "V", offerings: ["Thermal transfer labels"], avoid: ["cheapest"] },
      input,
    );
    expect(card.proofPoints).toEqual(["ISO 9001:2015 certified since 2018"]);
    expect(card.rules).toEqual(["Use at most 5 hashtags."]);
  });

  it("does not send facts or rules to the model", () => {
    const prompt = buildBrandCardPrompt(input);
    expect(prompt).toContain("Thermal transfer labels");
    expect(prompt).not.toContain("ISO 9001");
    expect(prompt).not.toContain("at most 5 hashtags");
  });

  it("changes the input hash whenever the brand data changes", () => {
    const changed = { ...input, verifiedFacts: [...input.verifiedFacts, "Serves 300 factories"] };
    expect(brandCardInputHash(input)).toBe(brandCardInputHash({ ...input }));
    expect(brandCardInputHash(changed)).not.toBe(brandCardInputHash(input));
  });
});
