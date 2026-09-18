import { describe, expect, it } from "vitest";
import { extractPage } from "./extract";

const html = `<!doctype html>
<html><head>
  <title>Kaveri Labels &amp; Ribbons</title>
  <meta name="description" content="Thermal labels made in Coimbatore">
  <script>window.tracking = "should not appear";</script>
  <style>.x { color: red }</style>
</head>
<body>
  <header><a href="/">Home</a></header>
  <nav><a href="/services#top">Services</a> <a href="https://kaveri.example/about">About</a> <a href="mailto:hi@kaveri.example">Mail</a></nav>
  <main>
    <h1>Industrial labels</h1>
    <p>We print   thermal transfer labels.</p>
    <h2>Certified quality</h2>
    <ul><li>ISO 9001:2015 certified</li><li>தரமான லேபிள்கள்</li></ul>
  </main>
  <footer>Copyright text that should not appear</footer>
</body></html>`;

describe("extractPage", () => {
  const page = extractPage(html, "https://kaveri.example/");

  it("reads the title and description with entities decoded", () => {
    expect(page.title).toBe("Kaveri Labels & Ribbons");
    expect(page.description).toBe("Thermal labels made in Coimbatore");
  });

  it("keeps headings and main text but drops scripts, styles, navigation and footers", () => {
    expect(page.headings).toEqual(["Industrial labels", "Certified quality"]);
    expect(page.text).toContain("We print thermal transfer labels.");
    expect(page.text).toContain("ISO 9001:2015 certified");
    expect(page.text).toContain("தரமான லேபிள்கள்");
    expect(page.text).not.toContain("tracking");
    expect(page.text).not.toContain("Copyright");
  });

  it("collects absolute web links from navigation, without fragments or mail links", () => {
    expect(page.links).toContain("https://kaveri.example/services");
    expect(page.links).toContain("https://kaveri.example/about");
    expect(page.links.some((link) => link.startsWith("mailto:"))).toBe(false);
  });
});
