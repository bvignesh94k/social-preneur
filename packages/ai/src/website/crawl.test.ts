import { describe, expect, it } from "vitest";
import { crawlWebsite } from "./crawl";
import type { FetchImpl, ResponseLike } from "./safe-fetch";

function page(status: number, body: string, contentType = "text/html; charset=utf-8"): ResponseLike {
  const bytes = new TextEncoder().encode(body);
  let done = false;
  return {
    status,
    headers: { get: (name) => (name === "content-type" ? contentType : null) },
    body: {
      getReader: () => ({
        read: async () => {
          if (done) return { done: true };
          done = true;
          return { done: false, value: bytes };
        },
        cancel: async () => {},
      }),
    },
  };
}

const longText = (topic: string) => `<main><h1>${topic}</h1><p>${`${topic} details for industrial buyers. `.repeat(5)}</p></main>`;

// Factories, because a response body can only be read once.
const site: Record<string, () => ResponseLike> = {
  "https://kaveri.example/robots.txt": () =>
    page(200, "User-agent: *\nDisallow: /private\nSitemap: https://kaveri.example/sitemap.xml", "text/plain"),
  "https://kaveri.example/": () =>
    page(
      200,
      `<html><head><title>Kaveri</title></head><body><nav><a href="/about">About</a><a href="/private/staff">Staff</a></nav>${longText("Home")}</body></html>`,
    ),
  "https://kaveri.example/sitemap.xml": () =>
    page(
      200,
      "<urlset><url><loc>https://kaveri.example/services</loc></url><url><loc>https://kaveri.example/empty</loc></url><url><loc>https://elsewhere.example/services</loc></url></urlset>",
      "application/xml",
    ),
  "https://kaveri.example/services": () => page(200, `<html><body>${longText("Services")}</body></html>`),
  "https://kaveri.example/about": () => page(200, `<html><body>${longText("About")}</body></html>`),
  "https://kaveri.example/empty": () => page(200, "<html><body><p>Hi</p></body></html>"),
};

const fetch: FetchImpl = async (url) => site[url]?.() ?? page(404, "Not found");
const fetchOptions = { fetch, resolve: async () => ["93.184.216.34"] };

describe("crawlWebsite", () => {
  it("reads the homepage, useful linked and sitemap pages, and respects robots.txt", async () => {
    const result = await crawlWebsite("https://kaveri.example/", { fetchOptions });
    const urls = result.pages.map((p) => p.url);

    expect(urls[0]).toBe("https://kaveri.example/");
    expect(urls).toContain("https://kaveri.example/services");
    expect(urls).toContain("https://kaveri.example/about");
    expect(urls.some((url) => url.includes("elsewhere"))).toBe(false);
    expect(result.skipped).toContainEqual({ url: "https://kaveri.example/private/staff", reason: "Blocked by robots.txt" });
    expect(result.skipped).toContainEqual({ url: "https://kaveri.example/empty", reason: "Almost no text" });
  });

  it("stops at the page limit", async () => {
    const result = await crawlWebsite("https://kaveri.example/", { fetchOptions, maxPages: 2 });
    expect(result.pages).toHaveLength(2);
  });

  it("refuses sites whose robots.txt blocks everything", async () => {
    const blockAll: FetchImpl = async (url) =>
      url.endsWith("/robots.txt") ? page(200, "User-agent: *\nDisallow: /", "text/plain") : page(200, longText("x"));
    await expect(
      crawlWebsite("https://kaveri.example/", { fetchOptions: { ...fetchOptions, fetch: blockAll } }),
    ).rejects.toThrow("asks automated tools not to read it");
  });
});
