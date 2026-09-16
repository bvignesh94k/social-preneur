import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("builds URL-safe slugs from client names", () => {
    expect(slugify("Kaveri Industrial Labels Pvt. Ltd.")).toBe("kaveri-industrial-labels-pvt-ltd");
    expect(slugify("  Smith & Sons  ")).toBe("smith-and-sons");
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu");
  });

  it("falls back when the name has no Latin characters", () => {
    expect(slugify("காவேரி")).toBe("client");
  });

  it("caps length without leaving a trailing hyphen", () => {
    const slug = slugify("a".repeat(47) + " bcd");
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
  });
});
