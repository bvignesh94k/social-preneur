import { describe, expect, it } from "vitest";
import { cleanWebsiteAnalysis, type WebsiteAnalysis } from "./website-analysis";

const base: WebsiteAnalysis = {
  pages: [
    { url: "https://kaveri.example/services/", category: "services", summary: "Services page" },
    { url: "https://invented.example/", category: "other", summary: "Not read" },
  ],
  profile: {
    description: "  Thermal   labels maker ",
    targetAudience: null,
    targetLocations: ["Coimbatore", ""],
    usps: [],
    primaryCta: null,
    phone: "call us anytime",
    email: "sales@kaveri.example",
    socialLinks: [
      { platform: "linkedin", url: "https://linkedin.com/company/kaveri" },
      { platform: "x", url: "javascript:alert(1)" },
    ],
  },
  offerings: [
    { kind: "product", name: "Thermal labels", summary: null, benefits: ["Heat resistant"], sourceUrl: "https://www.kaveri.example/services" },
    { kind: "product", name: "thermal labels", summary: null, benefits: [], sourceUrl: "https://kaveri.example/services" },
    { kind: "service", name: "Existing service", summary: null, benefits: [], sourceUrl: "https://kaveri.example/services" },
    { kind: "service", name: "Made up service", summary: null, benefits: [], sourceUrl: "https://kaveri.example/not-crawled" },
  ],
  facts: [
    { kind: "certification", statement: "ISO 9001:2015 certified", sourceUrl: "https://kaveri.example/services" },
    { kind: "statistic", statement: "Trusted by 500 factories", sourceUrl: "https://nowhere.example/" },
  ],
};

describe("cleanWebsiteAnalysis", () => {
  const cleaned = cleanWebsiteAnalysis(base, {
    pageUrls: ["https://kaveri.example/", "https://kaveri.example/services"],
    existingOfferingNames: ["Existing Service"],
  });

  it("keeps only offerings and facts tied to pages that were actually read", () => {
    expect(cleaned.offerings.map((o) => o.name)).toEqual(["Thermal labels"]);
    expect(cleaned.offerings[0]?.sourceUrl).toBe("https://kaveri.example/services");
    expect(cleaned.facts.map((f) => f.statement)).toEqual(["ISO 9001:2015 certified"]);
    expect(cleaned.pages.map((p) => p.url)).toEqual(["https://kaveri.example/services"]);
  });

  it("drops duplicates and offerings that already exist", () => {
    expect(cleaned.offerings.some((o) => o.name === "Existing service")).toBe(false);
  });

  it("cleans profile values and rejects unsafe or malformed contact details", () => {
    expect(cleaned.profile.description).toBe("Thermal labels maker");
    expect(cleaned.profile.targetLocations).toEqual(["Coimbatore"]);
    expect(cleaned.profile.phone).toBeNull();
    expect(cleaned.profile.email).toBe("sales@kaveri.example");
    expect(cleaned.profile.socialLinks).toEqual([{ platform: "linkedin", url: "https://linkedin.com/company/kaveri" }]);
  });
});
