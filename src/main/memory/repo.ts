import { openDb } from './db';
import type { Mood } from '../../shared/snapshot';

export type Role = 'user' | 'minari';

export interface Message {
  role: Role;
  content: string;
  createdAt: number;
}

export function recordMessage(role: Role, content: string): number {
  const db = openDb();
  const now = Date.now();
  const result = db
    .prepare('INSERT INTO conversations (role, content, created_at) VALUES (?, ?, ?)')
    .run(role, content, now);
  return Number(result.lastInsertRowid);
}

export function getRecentHistory(limit = 10): Message[] {
  const db = openDb();
  const rows = db
    .prepare('SELECT role, content, created_at FROM conversations ORDER BY id DESC LIMIT ?')
    .all(limit) as { role: Role; content: string; created_at: number }[];
  return rows
    .reverse()
    .map((r) => ({ role: r.role, content: r.content, createdAt: r.created_at }));
}

export function getState(key: string): string | null {
  const db = openDb();
  const row = db.prepare('SELECT value FROM state WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setState(key: string, value: string) {
  const db = openDb();
  db.prepare(
    'INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}

export function recordDiary(content: string, mood: Mood) {
  const db = openDb();
  db.prepare('INSERT INTO diary (content, mood, created_at) VALUES (?, ?, ?)').run(
    content,
    mood,
    Date.now(),
  );
}

// Most recent diary entry's text, or null if none has been written yet.
export function getRecentDiary(): string | null {
  const db = openDb();
  const row = db
    .prepare('SELECT content FROM diary ORDER BY id DESC LIMIT 1')
    .get() as { content: string } | undefined;
  return row?.content ?? null;
}

export function getTodaysMessageCount(now = Date.now()): number {
  const db = openDb();
  const start = startOfLocalDay(now);
  const row = db
    .prepare('SELECT COUNT(*) as c FROM conversations WHERE created_at >= ?')
    .get(start) as { c: number };
  return row.c;
}

export function getTodaysHistory(now = Date.now(), limit = 20): Message[] {
  const db = openDb();
  const start = startOfLocalDay(now);
  // Last `limit` of today, then re-sort ascending so the dialogue reads forward.
  const rows = db
    .prepare(
      'SELECT role, content, created_at FROM conversations WHERE created_at >= ? ORDER BY id DESC LIMIT ?',
    )
    .all(start, limit) as { role: Role; content: string; created_at: number }[];
  return rows
    .reverse()
    .map((r) => ({ role: r.role, content: r.content, createdAt: r.created_at }));
}

function startOfLocalDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
