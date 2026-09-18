const PRIORITY: [RegExp, number][] = [
  [/(^|\/)(services?|solutions?|what-we-do|offerings?)(\/|-|$)/i, 100],
  [/(^|\/)(products?|shop|catalogue|catalog|collections?)(\/|-|$)/i, 95],
  [/(^|\/)(about|about-us|company|who-we-are|our-story)(\/|$)/i, 90],
  [/(^|\/)(industries|sectors|markets)(\/|$)/i, 70],
  [/(^|\/)(case-stud(y|ies)|portfolio|projects|clients|our-work)(\/|$)/i, 65],
  [/(^|\/)(testimonials?|reviews)(\/|$)/i, 60],
  [/(^|\/)(certifications?|quality|awards)(\/|$)/i, 60],
  [/(^|\/)(faqs?)(\/|$)/i, 55],
  [/(^|\/)(contact|contact-us|locations?)(\/|$)/i, 50],
];

const SKIP =
  /(^|\/)(wp-admin|wp-login|wp-json|login|signin|sign-in|register|cart|checkout|my-account|account|privacy|privacy-policy|terms|cookies?|tag|category|author|feed)(\/|$)|\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|mp3|docx?|xlsx?|pptx?)$/i;

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

export function sameSite(url: URL, root: URL): boolean {
  return bareHost(url.hostname) === bareHost(root.hostname);
}

// Identity for de-duplication only; the original URL is still what gets fetched.
export function urlKey(url: URL): string {
  const copy = new URL(url);
  copy.hash = "";
  for (const key of [...copy.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) copy.searchParams.delete(key);
  }
  const path = copy.pathname.length > 1 ? copy.pathname.replace(/\/+$/, "") : copy.pathname;
  return `${bareHost(copy.hostname)}${path}${copy.search}`;
}

export function scorePath(pathname: string): number {
  if (pathname === "/" || pathname === "") return 1000;
  if (SKIP.test(pathname)) return -1;
  let score = 10;
  for (const [pattern, weight] of PRIORITY) {
    if (pattern.test(pathname)) score = Math.max(score, weight);
  }
  return score - pathname.split("/").filter(Boolean).length * 3;
}

export function pickPages(root: URL, candidates: Iterable<string>, limit: number): string[] {
  const seen = new Set<string>();
  const scored: { url: string; score: number }[] = [];

  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !sameSite(url, root)) continue;
    const key = urlKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    const score = scorePath(url.pathname);
    if (score >= 0) scored.push({ url: url.toString(), score });
  }

  // A cap per section stops one large area, such as dozens of case studies, crowding out products and services.
  const perSection = new Map<string, number>();
  const picked: string[] = [];
  for (const entry of scored.sort((a, b) => b.score - a.score || a.url.length - b.url.length)) {
    const section = new URL(entry.url).pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
    const count = perSection.get(section) ?? 0;
    if (section && count >= MAX_PAGES_PER_SECTION) continue;
    perSection.set(section, count + 1);
    picked.push(entry.url);
    if (picked.length >= limit) break;
  }
  return picked;
}

const MAX_PAGES_PER_SECTION = 3;
