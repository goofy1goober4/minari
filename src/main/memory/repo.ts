import { openDb } from './db';

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
