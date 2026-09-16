export interface RobotsRules {
  disallow: string[];
  allow: string[];
  sitemaps: string[];
}

export function parseRobots(text: string, agent = "socialpreneurbot"): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [], sitemaps: [] };
  let groupApplies = false;
  let groupHasRules = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "sitemap") {
      if (value) rules.sitemaps.push(value);
    } else if (field === "user-agent") {
      if (groupHasRules) {
        groupApplies = false;
        groupHasRules = false;
      }
      if (value === "*" || value.toLowerCase() === agent) groupApplies = true;
    } else if (field === "disallow" || field === "allow") {
      groupHasRules = true;
      if (groupApplies && value) rules[field].push(value);
    }
  }
  return rules;
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

// The longest matching rule wins; Allow wins a tie, as major crawlers do.
export function isPathAllowed(rules: RobotsRules, pathWithQuery: string): boolean {
  let best: { length: number; allow: boolean } | null = null;
  const consider = (patterns: string[], allow: boolean) => {
    for (const pattern of patterns) {
      if (!patternToRegex(pattern).test(pathWithQuery)) continue;
      if (!best || pattern.length > best.length || (pattern.length === best.length && allow)) {
        best = { length: pattern.length, allow };
      }
    }
  };
  consider(rules.disallow, false);
  consider(rules.allow, true);
  return (best as { allow: boolean } | null)?.allow ?? true;
}
