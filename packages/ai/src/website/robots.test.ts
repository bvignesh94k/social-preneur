import { describe, expect, it } from "vitest";
import { isPathAllowed, parseRobots } from "./robots";

describe("parseRobots", () => {
  it("applies only groups for all agents or this crawler, and collects sitemaps", () => {
    const rules = parseRobots(
      [
        "User-agent: Googlebot",
        "Disallow: /google-only",
        "",
        "User-agent: *",
        "Disallow: /admin",
        "Allow: /admin/public",
        "",
        "Sitemap: https://example.com/sitemap.xml # main",
      ].join("\n"),
    );
    expect(rules.disallow).toEqual(["/admin"]);
    expect(rules.allow).toEqual(["/admin/public"]);
    expect(rules.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("treats consecutive user-agent lines as one group", () => {
    const rules = parseRobots("User-agent: Bingbot\nUser-agent: *\nDisallow: /private");
    expect(rules.disallow).toEqual(["/private"]);
  });
});

describe("isPathAllowed", () => {
  const rules = parseRobots(
    "User-agent: *\nDisallow: /admin\nAllow: /admin/public\nDisallow: /*.pdf$\nDisallow: /search?",
  );

  it("uses the most specific rule", () => {
    expect(isPathAllowed(rules, "/admin/settings")).toBe(false);
    expect(isPathAllowed(rules, "/admin/public/page")).toBe(true);
  });

  it("supports wildcards and end anchors", () => {
    expect(isPathAllowed(rules, "/files/brochure.pdf")).toBe(false);
    expect(isPathAllowed(rules, "/files/brochure.pdf.html")).toBe(true);
    expect(isPathAllowed(rules, "/search?q=labels")).toBe(false);
  });

  it("allows everything when nothing matches", () => {
    expect(isPathAllowed(rules, "/services")).toBe(true);
    expect(isPathAllowed(parseRobots(""), "/anything")).toBe(true);
  });
});
