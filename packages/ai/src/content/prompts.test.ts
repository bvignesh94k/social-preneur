import { describe, expect, it } from "vitest";
import type { BrandCard } from "../brand/brand-card";
import { CAPTIONS_SYSTEM, buildCaptionsPrompt, buildRepurposePrompt } from "./captions";
import { IDEAS_SYSTEM, buildIdeasPrompt } from "./ideas";

const brandCard: BrandCard = {
  summary: "Kaveri Industrial Labels prints thermal labels for cold chain packaging.",
  audience: "Packaging managers at food processors in Tamil Nadu.",
  voice: "Plain, practical, no hype.",
  offerings: ["Thermal transfer labels", "Barcode label printing"],
  avoid: ["cheapest", "world class"],
  proofPoints: ["ISO 9001 certified since 2019", "Labels tested to minus 40 degrees"],
  rules: ["At most 5 hashtags", "No emojis"],
};

describe("ideas prompt", () => {
  it("refuses invention in the instructions rather than hoping for it", () => {
    expect(IDEAS_SYSTEM).toMatch(/Never invent a number, award, certification/);
    expect(IDEAS_SYSTEM).toMatch(/proof points are the only factual claims/);
    expect(IDEAS_SYSTEM).toMatch(/No em dashes/);
  });

  it("carries the brand card, the gaps and the neglected offerings", () => {
    const prompt = buildIdeasPrompt({
      brandCard,
      language: "en",
      count: 6,
      wantedCategories: ["educational", "social_proof"],
      alreadyCovered: ["Three ways thermal labels survive cold storage"],
      neglectedOfferings: ["Barcode label printing"],
      occasion: null,
    });

    expect(prompt).toContain("Suggest 6 post ideas");
    expect(prompt).toContain("ISO 9001 certified since 2019");
    expect(prompt).toContain("educational, social_proof");
    expect(prompt).toContain("Barcode label printing");
    expect(prompt).toContain("Three ways thermal labels survive cold storage");
  });

  it("says so plainly when the client has no history yet", () => {
    const prompt = buildIdeasPrompt({
      brandCard,
      language: "en",
      count: 3,
      wantedCategories: [],
      alreadyCovered: [],
      neglectedOfferings: [],
      occasion: null,
    });

    expect(prompt).toContain("Nothing has been posted yet");
    expect(prompt).toContain("Categories this month is short of: any");
  });

  it("only allows an occasion when it genuinely fits", () => {
    const prompt = buildIdeasPrompt({
      brandCard,
      language: "ta",
      count: 4,
      wantedCategories: ["engagement"],
      alreadyCovered: [],
      neglectedOfferings: [],
      occasion: "Pongal on 15 January",
    });

    expect(prompt).toContain("Write in Tamil.");
    expect(prompt).toMatch(/only if it genuinely fits/);
    expect(prompt).toContain("Pongal on 15 January");
  });
});

describe("captions prompt", () => {
  const input = {
    brandCard,
    language: "en" as const,
    post: {
      title: "Cold storage label guide",
      category: "educational",
      caption: "Labels peel when the adhesive is wrong for the temperature.",
      notes: null,
      offering: "Thermal transfer labels",
    },
    platforms: ["x", "instagram", "pinterest"] as const,
    linkUrl: "https://kaveri.example/guide",
  };

  it("tells the model each platform's real limits", () => {
    const prompt = buildCaptionsPrompt({ ...input, platforms: [...input.platforms] });

    expect(prompt).toContain("x: caption limit 280 characters, at most 2 hashtags");
    expect(prompt).toContain("an image is required");
    expect(prompt).toContain("title up to 100 characters");
    expect(prompt).toContain("links are not clickable");
  });

  it("passes the link and the post through", () => {
    const prompt = buildCaptionsPrompt({ ...input, platforms: [...input.platforms] });
    expect(prompt).toContain("https://kaveri.example/guide");
    expect(prompt).toContain("Cold storage label guide");
  });

  it("keeps the same no invention rule as the rest", () => {
    expect(CAPTIONS_SYSTEM).toMatch(/Never invent/);
    expect(CAPTIONS_SYSTEM).toMatch(/Do not paste the same text everywhere/);
  });

  it("gives the original post when repurposing", () => {
    const prompt = buildRepurposePrompt({
      ...input,
      platforms: ["threads"],
      sourcePlatform: "linkedin",
      sourceCaption: "The long LinkedIn version of the label guide.",
    });

    expect(prompt).toContain("Rewrite this linkedin post for: threads");
    expect(prompt).toContain("The long LinkedIn version of the label guide.");
  });
});
