import { describe, expect, it } from "vitest";
import { REPEAT_THRESHOLD, findSimilar, similarity, tokenize } from "./similarity";

describe("tokenize", () => {
  it("drops links, hashtags and filler words", () => {
    expect(tokenize("Our labels stick! #packaging https://example.com")).toEqual(["labels", "stick"]);
  });

  it("keeps non-latin words", () => {
    expect(tokenize("லேபிள் தரம்")).toEqual(["லேபிள்", "தரம்"]);
  });
});

describe("similarity", () => {
  it("scores a reworded duplicate as a repeat", () => {
    const score = similarity(
      "Three ways thermal labels survive cold storage",
      "Three ways that thermal labels survive cold storage",
    );
    expect(score).toBeGreaterThan(REPEAT_THRESHOLD);
  });

  it("scores two different angles on one product as not a repeat", () => {
    const score = similarity(
      "Three ways thermal labels survive cold storage",
      "Why our packaging plant switched to recycled cartons",
    );
    expect(score).toBeLessThan(REPEAT_THRESHOLD);
  });

  it("returns zero when one side has no usable words", () => {
    expect(similarity("the and of", "labels")).toBe(0);
  });
});

describe("findSimilar", () => {
  const history = [
    { id: "1", text: "Three ways thermal labels survive cold storage" },
    { id: "2", text: "Meet the team behind our packaging line" },
    { id: "3", text: "Thermal labels that survive cold storage, three ways" },
  ];

  it("returns the closest matches first and leaves out the unrelated ones", () => {
    const matches = findSimilar("Thermal labels surviving cold storage: three ways", history);
    expect(matches.map((match) => match.id)).toEqual(["3", "1"]);
    expect(matches[0]!.score).toBeGreaterThanOrEqual(matches[1]!.score);
  });

  it("returns nothing for a genuinely new idea", () => {
    expect(findSimilar("A guide to food grade ink certification", history)).toEqual([]);
  });
});
