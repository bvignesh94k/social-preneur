import { pickPages, sameSite, urlKey } from "./discover";
import { extractPage, type ExtractedPage } from "./extract";
import { isPathAllowed, parseRobots, type RobotsRules } from "./robots";
import { safeFetchText, WebsiteFetchError, type SafeFetchOptions } from "./safe-fetch";

export interface CrawledPage {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
}

export interface CrawlResult {
  rootUrl: string;
  pages: CrawledPage[];
  skipped: { url: string; reason: string }[];
}

const toCrawled = (url: string, page: ExtractedPage): CrawledPage => ({
  url,
  title: page.title,
  description: page.description,
  headings: page.headings,
  text: page.text,
});

const decodeXml = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

async function loadRobots(origin: URL, fetchOptions: SafeFetchOptions): Promise<RobotsRules> {
  try {
    const doc = await safeFetchText(new URL("/robots.txt", origin).toString(), { ...fetchOptions, maxBytes: 500_000 });
    return doc.status === 200 ? parseRobots(doc.body) : parseRobots("");
  } catch {
    return parseRobots("");
  }
}

async function loadSitemap(url: string, root: URL, fetchOptions: SafeFetchOptions, nested = false): Promise<string[]> {
  try {
    if (!sameSite(new URL(url), root)) return [];
    const doc = await safeFetchText(url, { ...fetchOptions, maxBytes: 5_000_000 });
    if (doc.status >= 400) return [];
    const locations = [...doc.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
      .map((match) => decodeXml(match[1] ?? ""))
      .slice(0, 500);
    if (!nested && /<sitemapindex/i.test(doc.body)) {
      const children = await Promise.all(locations.slice(0, 3).map((loc) => loadSitemap(loc, root, fetchOptions, true)));
      return children.flat();
    }
    return locations;
  } catch {
    return [];
  }
}

export async function crawlWebsite(
  input: string,
  options: { maxPages?: number; fetchOptions?: SafeFetchOptions } = {},
): Promise<CrawlResult> {
  const maxPages = options.maxPages ?? 15;
  const fetchOptions = options.fetchOptions ?? {};
  const inputUrl = new URL(input);

  let robots = await loadRobots(inputUrl, fetchOptions);
  if (!isPathAllowed(robots, inputUrl.pathname + inputUrl.search)) {
    throw new WebsiteFetchError("This website asks automated tools not to read it, so it was not scanned.");
  }

  const home = await safeFetchText(input, fetchOptions);
  if (home.status >= 400) throw new WebsiteFetchError(`The website answered with an error (HTTP ${home.status}).`);
  const root = new URL(home.url);
  if (root.origin !== inputUrl.origin) robots = await loadRobots(root, fetchOptions);

  const homePage = extractPage(home.body, home.url);
  const candidates = new Set(homePage.links);
  const sitemapUrls = robots.sitemaps.length > 0 ? robots.sitemaps.slice(0, 3) : [new URL("/sitemap.xml", root).toString()];
  for (const sitemapUrl of sitemapUrls) {
    for (const location of await loadSitemap(sitemapUrl, root, fetchOptions)) candidates.add(location);
  }

  const rootKey = urlKey(root);
  const queue = pickPages(root, candidates, maxPages).filter((url) => urlKey(new URL(url)) !== rootKey).slice(0, maxPages - 1);

  const pages: CrawledPage[] = [toCrawled(home.url, homePage)];
  const skipped: CrawlResult["skipped"] = [];

  // Three pages at a time keeps scans quick without hammering small business websites.
  for (let i = 0; i < queue.length; i += 3) {
    const batch = queue.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(async (url) => {
        const target = new URL(url);
        if (!isPathAllowed(robots, target.pathname + target.search)) return { url, reason: "Blocked by robots.txt" };
        try {
          const doc = await safeFetchText(url, fetchOptions);
          if (doc.status >= 400) return { url, reason: `HTTP ${doc.status}` };
          if (!/html/i.test(doc.contentType)) return { url, reason: "Not a web page" };
          const extracted = extractPage(doc.body, doc.url);
          if (extracted.text.length < 80) return { url, reason: "Almost no text" };
          return toCrawled(doc.url, extracted);
        } catch (error) {
          return { url, reason: error instanceof Error ? error.message : "Could not load" };
        }
      }),
    );
    for (const result of results) {
      if ("reason" in result) skipped.push(result);
      else pages.push(result);
    }
  }

  return { rootUrl: root.toString(), pages, skipped };
}
