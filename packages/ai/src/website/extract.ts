import { parse } from "node-html-parser";

export interface ExtractedPage {
  title: string;
  description: string;
  headings: string[];
  text: string;
  links: string[];
}

const NOISE = "script, style, noscript, svg, iframe, template, nav, footer, form, header";

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

export function extractPage(html: string, pageUrl: string): ExtractedPage {
  const root = parse(html, { comment: false });

  const title = oneLine(root.querySelector("title")?.text ?? "");
  const description = oneLine(
    root.querySelector('meta[name="description"]')?.getAttribute("content") ??
      root.querySelector('meta[property="og:description"]')?.getAttribute("content") ??
      "",
  );

  // Links are collected before navigation is stripped, because menus point to the most useful pages.
  const links = new Set<string>();
  for (const anchor of root.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    if (!href) continue;
    try {
      const url = new URL(href, pageUrl);
      url.hash = "";
      if (url.protocol === "http:" || url.protocol === "https:") links.add(url.toString());
    } catch {
      // Ignore malformed links.
    }
  }

  for (const node of root.querySelectorAll(NOISE)) node.remove();

  const headings = root
    .querySelectorAll("h1, h2, h3")
    .map((heading) => oneLine(heading.text))
    .filter(Boolean)
    .slice(0, 40);

  const container = root.querySelector("main") ?? root.querySelector("body") ?? root;
  const text = container.structuredText
    .split("\n")
    .map(oneLine)
    .filter(Boolean)
    .join("\n")
    .slice(0, 20_000);

  return { title, description, headings, text, links: [...links] };
}
