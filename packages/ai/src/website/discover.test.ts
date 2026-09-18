import { describe, expect, it } from "vitest";
import { pickPages, scorePath, urlKey } from "./discover";

describe("scorePath", () => {
  it("prefers business pages and skips account, legal and file links", () => {
    expect(scorePath("/services")).toBeGreaterThan(scorePath("/blog/some-post"));
    expect(scorePath("/about-us")).toBeGreaterThan(scorePath("/news"));
    expect(scorePath("/privacy-policy")).toBe(-1);
    expect(scorePath("/brochure.pdf")).toBe(-1);
    expect(scorePath("/cart")).toBe(-1);
  });
});

describe("urlKey", () => {
  it("ignores www, trailing slashes, fragments and tracking parameters", () => {
    expect(urlKey(new URL("https://www.Kaveri.example/services/?utm_source=x#top"))).toBe(
      urlKey(new URL("https://kaveri.example/services")),
    );
  });
});

describe("pickPages", () => {
  const root = new URL("https://kaveri.example/");

  it("keeps same-site pages only, removes duplicates and orders by usefulness", () => {
    const picked = pickPages(
      root,
      [
        "https://kaveri.example/blog/2024/labels",
        "https://www.kaveri.example/services/",
        "https://kaveri.example/services",
        "https://other-site.example/services",
        "https://kaveri.example/about",
        "https://kaveri.example/terms",
        "not a url",
      ],
      10,
    );
    expect(picked[0]).toContain("/services");
    expect(picked).toContain("https://kaveri.example/about");
    expect(picked.filter((url) => url.includes("services"))).toHaveLength(1);
    expect(picked.some((url) => url.includes("other-site"))).toBe(false);
    expect(picked.some((url) => url.includes("/terms"))).toBe(false);
  });

  it("takes at most three pages from any one section", () => {
    const caseStudies = Array.from({ length: 9 }, (_, i) => `https://kaveri.example/case-studies/project-${i}`);
    const picked = pickPages(
      root,
      [...caseStudies, "https://kaveri.example/labels/pharma", "https://kaveri.example/about"],
      10,
    );
    expect(picked.filter((url) => url.includes("/case-studies/"))).toHaveLength(3);
    expect(picked).toContain("https://kaveri.example/labels/pharma");
    expect(picked).toContain("https://kaveri.example/about");
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => `https://kaveri.example/page-${i}`);
    expect(pickPages(root, many, 5)).toHaveLength(5);
  });
});
