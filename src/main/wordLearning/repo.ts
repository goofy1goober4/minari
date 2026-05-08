import { openDb } from '../memory/db';
import { findBestMatch as pureFindBestMatch, tokenizeForMatch } from './match';

export type LearnedStatus = 'unknown' | 'curious' | 'learned';

export interface LearnedWord {
  id: number;
  babyDescription: string;
  learnedName: string | null;
  status: LearnedStatus;
  imagePath: string | null;
  visionRaw: string | null;
  firstSeenAt: number;
  learnedAt: number | null;
  useCount: number;
}

interface LearnedWordRow {
  id: number;
  baby_description: string;
  learned_name: string | null;
  status: LearnedStatus;
  image_path: string | null;
  vision_raw: string | null;
  first_seen_at: number;
  learned_at: number | null;
  use_count: number;
}

function rowToWord(r: LearnedWordRow): LearnedWord {
  return {
    id: r.id,
    babyDescription: r.baby_description,
    learnedName: r.learned_name,
    status: r.status,
    imagePath: r.image_path,
    visionRaw: r.vision_raw,
    firstSeenAt: r.first_seen_at,
    learnedAt: r.learned_at,
    useCount: r.use_count,
  };
}

export function listLearned(): LearnedWord[] {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT id, baby_description, learned_name, status, image_path, vision_raw,
              first_seen_at, learned_at, use_count
       FROM learned_words WHERE status = 'learned'`,
    )
    .all() as LearnedWordRow[];
  return rows.map(rowToWord);
}

export function insertUnknown(input: {
  babyDescription: string;
  visionRaw: string;
  imagePath: string | null;
}): number {
  const db = openDb();
  const result = db
    .prepare(
      `INSERT INTO learned_words (baby_description, vision_raw, image_path, status)
       VALUES (?, ?, ?, 'unknown')`,
    )
    .run(input.babyDescription, input.visionRaw, input.imagePath);
  return Number(result.lastInsertRowid);
}

export function getOldestUnknown(minAgeSeconds: number): LearnedWord | null {
  const db = openDb();
  const row = db
    .prepare(
      `SELECT id, baby_description, learned_name, status, image_path, vision_raw,
              first_seen_at, learned_at, use_count
       FROM learned_words
       WHERE status = 'unknown'
         AND first_seen_at < unixepoch() - ?
       ORDER BY first_seen_at ASC
       LIMIT 1`,
    )
    .get(minAgeSeconds) as LearnedWordRow | undefined;
  return row ? rowToWord(row) : null;
}

export function getById(id: number): LearnedWord | null {
  const db = openDb();
  const row = db
    .prepare(
      `SELECT id, baby_description, learned_name, status, image_path, vision_raw,
              first_seen_at, learned_at, use_count
       FROM learned_words WHERE id = ?`,
    )
    .get(id) as LearnedWordRow | undefined;
  return row ? rowToWord(row) : null;
}

export function markCurious(id: number): void {
  const db = openDb();
  db.prepare(`UPDATE learned_words SET status = 'curious' WHERE id = ?`).run(id);
}

export function markLearned(id: number, learnedName: string): void {
  const db = openDb();
  db.prepare(
    `UPDATE learned_words
     SET learned_name = ?, status = 'learned', learned_at = unixepoch()
     WHERE id = ?`,
  ).run(learnedName, id);
}

export function bumpUseCount(id: number): void {
  const db = openDb();
  db.prepare(`UPDATE learned_words SET use_count = use_count + 1 WHERE id = ?`).run(id);
}

// On every successful match, fold the new vision raw's distinct tokens into
// the row's stored vision_raw. E2B vision drifts in vocabulary across photos
// of the same thing — the row's caption stays terse on day 1 but gradually
// accumulates the alternate words ("orange/yellow/warm", "circle/slice"),
// which is what gives the matcher more surface to hit on later drops.
export function mergeVisionRaw(id: number, newVisionRaw: string): void {
  const db = openDb();
  const row = db
    .prepare(`SELECT vision_raw FROM learned_words WHERE id = ?`)
    .get(id) as { vision_raw: string | null } | undefined;
  if (!row) return;
  const existing = new Set(tokenizeForMatch(row.vision_raw ?? ''));
  for (const t of tokenizeForMatch(newVisionRaw)) existing.add(t);
  db.prepare(`UPDATE learned_words SET vision_raw = ? WHERE id = ?`).run(
    [...existing].join(' '),
    id,
  );
}

// 50%+ keyword overlap counts as the same kind of thing. E2B vision uses a
// small vocabulary, so the same object across photos repeats words — round,
// red, cheese, etc. Compared against `oldWords.size` so a longer new caption
// doesn't dilute the match.
export function findBestMatch(
  newVisionRaw: string,
  learnedWords: LearnedWord[],
): LearnedWord | null {
  return pureFindBestMatch(newVisionRaw, learnedWords);
}
