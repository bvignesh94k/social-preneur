import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTENT_MIX,
  checkVariant,
  compareMix,
  countPlatformCharacters,
  hasBlocker,
  mixWarnings,
} from "./content";

describe("countPlatformCharacters", () => {
  it("counts a link on X as a fixed length however long it is", () => {
    const long = `Read it here https://example.com/${"a".repeat(200)}`;
    expect(countPlatformCharacters("x", long)).toBeLessThan(60);
  });

  it("counts every character elsewhere", () => {
    expect(countPlatformCharacters("linkedin", "hello")).toBe(5);
  });

  it("counts an emoji as one character", () => {
    expect(countPlatformCharacters("threads", "ok 👍")).toBe(4);
  });
});

describe("checkVariant", () => {
  it("blocks a caption over the X limit and says by how much", () => {
    const issues = checkVariant("x", { caption: "a".repeat(300) });
    expect(hasBlocker(issues)).toBe(true);
    expect(issues[0]!.message).toContain("20 over");
  });

  it("blocks Instagram without an image", () => {
    const issues = checkVariant("instagram", { caption: "Nice packaging", hasMedia: false });
    expect(issues.some((issue) => issue.level === "blocker" && /image or video/.test(issue.message))).toBe(true);
  });

  it("accepts Instagram once an image is attached", () => {
    const issues = checkVariant("instagram", { caption: "Nice packaging", hasMedia: true });
    expect(hasBlocker(issues)).toBe(false);
  });

  it("warns that an Instagram link will not be clickable", () => {
    const issues = checkVariant("instagram", {
      caption: "Order now",
      hasMedia: true,
      linkUrl: "https://example.com",
    });
    expect(issues.some((issue) => issue.level === "warning" && /first comment/.test(issue.message))).toBe(true);
  });

  it("warns when there are more hashtags than perform on LinkedIn", () => {
    const issues = checkVariant("linkedin", {
      caption: "Labels that survive cold storage",
      hashtags: ["a", "b", "c", "d", "e", "f"],
    });
    expect(issues.some((issue) => /6 hashtags/.test(issue.message))).toBe(true);
  });

  it("blocks a Pinterest title over its shorter limit", () => {
    const issues = checkVariant("pinterest", {
      caption: "Pin description",
      title: "t".repeat(120),
      hasMedia: true,
    });
    expect(issues.some((issue) => /title/.test(issue.message))).toBe(true);
  });

  it("passes a clean LinkedIn post", () => {
    expect(checkVariant("linkedin", { caption: "Three ways to cut label waste", hashtags: ["packaging"] })).toEqual([]);
  });
});

describe("compareMix", () => {
  it("reports an empty month without dividing by zero", () => {
    const rows = compareMix({});
    expect(rows.every((row) => row.planned === 0 && row.share === 0 && row.drift === 0)).toBe(true);
  });

  it("flags a month that tipped promotional", () => {
    const rows = compareMix({ promotional: 8, educational: 2 });
    const promotional = rows.find((row) => row.category === "promotional")!;
    expect(promotional.share).toBe(80);
    expect(promotional.drift).toBe(60);
    expect(mixWarnings(rows).some((warning) => /Promotional is 60 points above/.test(warning))).toBe(true);
  });

  it("stays quiet when the month matches the targets", () => {
    const counts = { educational: 40, promotional: 20, social_proof: 15, engagement: 10, behind_the_scenes: 10, news: 5 };
    expect(mixWarnings(compareMix(counts, DEFAULT_CONTENT_MIX))).toEqual([]);
  });
});
