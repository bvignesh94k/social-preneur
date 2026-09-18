// Near-duplicate detection for captions and ideas, so the same angle is not
// published twice for one client. Word overlap only, which keeps it language
// agnostic and needs no database extension or model call.

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "for", "from", "get", "has",
  "have", "how", "in", "is", "it", "its", "of", "on", "or", "our", "so", "that", "the", "their",
  "them", "they", "this", "to", "we", "what", "when", "which", "why", "will", "with", "you", "your",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@]\S+/g, " ")
    // \p{M} keeps Tamil vowel signs and the pulli; without them the words fall apart.
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

function termFrequency(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [term, weight] of a) dot += weight * (b.get(term) ?? 0);
  if (dot === 0) return 0;

  const norm = (counts: Map<string, number>) =>
    Math.sqrt([...counts.values()].reduce((sum, weight) => sum + weight * weight, 0));
  const magnitude = norm(a) * norm(b);
  return magnitude === 0 ? 0 : dot / magnitude;
}

function bigrams(tokens: string[]): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) set.add(`${tokens[i]} ${tokens[i + 1]}`);
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  return shared / (a.size + b.size - shared);
}

// Topic overlap alone calls two different posts about one service a repeat, and
// phrase overlap alone misses a reworded duplicate, so both are weighed.
export function similarity(left: string, right: string): number {
  const a = tokenize(left);
  const b = tokenize(right);
  if (a.length === 0 || b.length === 0) return 0;

  const topical = cosine(termFrequency(a), termFrequency(b));
  const phrasing = jaccard(bigrams(a), bigrams(b));
  return Number((topical * 0.5 + phrasing * 0.5).toFixed(4));
}

export interface SimilarityCandidate {
  id: string;
  text: string;
  label?: string;
}

export interface SimilarityMatch extends SimilarityCandidate {
  score: number;
}

// Above this, two posts read as the same post to a follower scrolling past.
export const REPEAT_THRESHOLD = 0.5;

export function findSimilar(
  text: string,
  candidates: SimilarityCandidate[],
  threshold = REPEAT_THRESHOLD,
): SimilarityMatch[] {
  return candidates
    .map((candidate) => ({ ...candidate, score: similarity(text, candidate.text) }))
    .filter((match) => match.score >= threshold)
    .sort((left, right) => right.score - left.score);
}
