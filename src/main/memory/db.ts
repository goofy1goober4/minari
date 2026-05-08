import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';

let dbInstance: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('user', 'minari')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(
  content,
  content='conversations',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS conversations_ai AFTER INSERT ON conversations BEGIN
  INSERT INTO conversations_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS conversations_ad AFTER DELETE ON conversations BEGIN
  INSERT INTO conversations_fts(conversations_fts, rowid, content) VALUES('delete', old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS conversations_au AFTER UPDATE ON conversations BEGIN
  INSERT INTO conversations_fts(conversations_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO conversations_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  mood TEXT
);

CREATE TABLE IF NOT EXISTS soft_pings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  dismissed_at INTEGER
);

CREATE TABLE IF NOT EXISTS learned_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baby_description TEXT NOT NULL,
  learned_name TEXT,
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK(status IN ('unknown', 'curious', 'learned')),
  image_path TEXT,
  vision_raw TEXT,
  first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  learned_at INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_learned_status ON learned_words(status);
CREATE INDEX IF NOT EXISTS idx_learned_name ON learned_words(learned_name);
`;

export function openDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dbPath = join(app.getPath('userData'), 'minari.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  dbInstance = db;
  return db;
}

function migrate(db: Database.Database) {
  // diary.mood was added later; ALTER existing tables.
  const cols = db.prepare('PRAGMA table_info(diary)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'mood')) {
    db.exec('ALTER TABLE diary ADD COLUMN mood TEXT');
  }
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
