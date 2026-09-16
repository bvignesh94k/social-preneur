import { describe, expect, it } from "vitest";
import { applyHouseStyle, removeDashes } from "./house-style";

describe("removeDashes", () => {
  it("turns spaced and unspaced em dashes into commas", () => {
    expect(removeDashes("Fast delivery — every time.")).toBe("Fast delivery, every time.");
    expect(removeDashes("Quality—always")).toBe("Quality, always");
  });

  it("turns number ranges into hyphens", () => {
    expect(removeDashes("Open 2018–2020 and 9—5")).toBe("Open 2018-2020 and 9-5");
  });

  it("handles spaced en dashes and leftover punctuation", () => {
    expect(removeDashes("Chennai – Coimbatore")).toBe("Chennai, Coimbatore");
    expect(removeDashes("Ends here —.")).toBe("Ends here.");
    expect(removeDashes("— Starts here")).toBe("Starts here");
  });

  it("leaves text without dashes unchanged, including Tamil", () => {
    expect(removeDashes("தரமான லேபிள்கள், well-made labels.")).toBe("தரமான லேபிள்கள், well-made labels.");
  });
});

describe("applyHouseStyle", () => {
  it("cleans every string inside nested objects and arrays", () => {
    const input = { summary: "Labels — made well", items: ["A—B", { note: "x – y" }], count: 3, empty: null };
    expect(applyHouseStyle(input)).toEqual({
      summary: "Labels, made well",
      items: ["A, B", { note: "x, y" }],
      count: 3,
      empty: null,
    });
  });
});
