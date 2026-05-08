import { getState, setState } from '../memory/repo';
import { openDb } from '../memory/db';

const KEY_TEACHING = 'teaching_word_id';
const KEY_CONFIRMING = 'confirming_word';

export function enterTeachingMode(wordId: number): void {
  setState(KEY_TEACHING, String(wordId));
}

export function exitTeachingMode(): void {
  openDb().prepare(`DELETE FROM state WHERE key = ?`).run(KEY_TEACHING);
}

export function getTeachingWordId(): number | null {
  const v = getState(KEY_TEACHING);
  return v ? parseInt(v, 10) : null;
}

export interface ConfirmingWord {
  id: number;
  pendingName: string;
}

export function enterConfirmingMode(wordId: number, pendingName: string): void {
  setState(KEY_CONFIRMING, JSON.stringify({ id: wordId, pendingName }));
}

export function exitConfirmingMode(): void {
  openDb().prepare(`DELETE FROM state WHERE key = ?`).run(KEY_CONFIRMING);
}

export function getConfirmingWord(): ConfirmingWord | null {
  const v = getState(KEY_CONFIRMING);
  if (!v) return null;
  try {
    const parsed = JSON.parse(v) as ConfirmingWord;
    if (typeof parsed.id !== 'number' || typeof parsed.pendingName !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}
