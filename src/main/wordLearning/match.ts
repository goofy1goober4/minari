// Pure keyword-overlap matcher. Lives outside repo.ts so the regression
// suite can import it without dragging in better-sqlite3/electron.

export interface MatchableWord {
  id: number;
  learnedName: string | null;
  visionRaw: string | null;
}

// E2B vision is stable on the noun (cheese, cat, sky) but drifts on adjectives
// (warm/orange/round/fuzzy). 0.3 catches a single shared noun in a typical
// 3-token caption (1/3 ≈ 0.333) while still rejecting 1-of-5 collisions
// between unrelated photos (1/5 = 0.2). Scored against the smaller vocabulary
// so a long old caption doesn't dilute a fresh terse one.
const MATCH_THRESHOLD = 0.3;

export function findBestMatch<T extends MatchableWord>(
  newVisionRaw: string,
  learnedWords: T[],
): T | null {
  const newWords = tokenize(newVisionRaw);
  if (newWords.size === 0) return null;
  let bestMatch: T | null = null;
  let bestScore = 0;
  for (const lw of learnedWords) {
    if (!lw.visionRaw) continue;
    const oldWords = tokenize(lw.visionRaw);
    if (oldWords.size === 0) continue;
    let overlap = 0;
    for (const w of newWords) if (oldWords.has(w)) overlap++;
    const score = overlap / Math.min(oldWords.size, newWords.size);
    if (score >= MATCH_THRESHOLD && score > bestScore) {
      bestScore = score;
      bestMatch = lw;
    }
  }
  return bestMatch;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
}

// Public so repo.ts can union new vision tokens into a learned row's
// vision_raw without re-implementing the same tokenization.
export function tokenizeForMatch(s: string): string[] {
  return [...tokenize(s)];
}
