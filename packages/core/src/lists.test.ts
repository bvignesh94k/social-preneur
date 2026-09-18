import { describe, expect, it } from "vitest";
import { isHexColor } from "./brand";
import { normalizeHashtag, parseHashtags, parseLines, parseList } from "./lists";

describe("parseList", () => {
  it("splits on commas and new lines, trims and removes duplicates", () => {
    expect(parseList("Chennai, Coimbatore\n chennai ,, Madurai ")).toEqual(["Chennai", "Coimbatore", "Madurai"]);
  });

  it("respects the maximum item count and length", () => {
    expect(parseList("a, b, c", { max: 2 })).toEqual(["a", "b"]);
    expect(parseList("abcdef", { maxLength: 3 })).toEqual(["abc"]);
  });
});

describe("parseLines", () => {
  it("keeps commas inside each line", () => {
    expect(parseLines("Fast, reliable delivery\nISO certified plant")).toEqual([
      "Fast, reliable delivery",
      "ISO certified plant",
    ]);
  });
});

describe("hashtags", () => {
  it("adds the hash sign and strips punctuation", () => {
    expect(normalizeHashtag("digital marketing!")).toBe("#digitalmarketing");
    expect(normalizeHashtag("##Labels")).toBe("#Labels");
    expect(normalizeHashtag("  #  ")).toBeNull();
  });

  it("keeps Tamil hashtags intact, including vowel signs", () => {
    expect(normalizeHashtag("#தமிழ்நாடு")).toBe("#தமிழ்நாடு");
    expect(parseHashtags("#கோயம்புத்தூர் coimbatore")).toEqual(["#கோயம்புத்தூர்", "#coimbatore"]);
  });

  it("removes case-insensitive duplicates", () => {
    expect(parseHashtags("#Labels, labels #LABELS #print")).toEqual(["#Labels", "#print"]);
  });
});

describe("isHexColor", () => {
  it("accepts six-digit hex colours only", () => {
    expect(isHexColor("#0F6B57")).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("0f6b57")).toBe(false);
  });
});
