import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Appearance } from '../../packages/shared/appearance.js';
import type { Stats } from '../../packages/shared/stats.js';
export type Catch = { name: string; size: number; price: number; perfect?: boolean };
export type PlayerRow = {
  id: string;
  name: string;
  color: string;
  coins: number;
  inventory: string;
  appearance: string;
  stats: string;
  banned: number;
  muted: number;
};
// Ordered, idempotent migrations tracked with SQLite's user_version.
// Migration 1 reproduces the original schema so existing production databases
// (players, coins, inventory, appearance, recovery-code hashes) are untouched.
const migrations: Array<(db: DatabaseSync) => void> = [
  (db) => {
    db.exec(
      "CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, coins INTEGER NOT NULL DEFAULT 0 CHECK(coins>=0), inventory TEXT NOT NULL DEFAULT '[]')",
    );
    const columns = db.prepare('PRAGMA table_info(players)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'appearance'))
      db.exec("ALTER TABLE players ADD COLUMN appearance TEXT NOT NULL DEFAULT '{}'");
  },
  // Migration 2: progression stats (catches, perfects, discoveries, minigame records) as JSON.
  (db) => {
    const columns = db.prepare('PRAGMA table_info(players)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'stats')) db.exec("ALTER TABLE players ADD COLUMN stats TEXT NOT NULL DEFAULT '{}'");
  },
  // Migration 3: moderation flags and a settings table (who holds the dev role, world overrides).
  (db) => {
    const columns = db.prepare('PRAGMA table_info(players)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'banned')) db.exec('ALTER TABLE players ADD COLUMN banned INTEGER NOT NULL DEFAULT 0');
    if (!columns.some((c) => c.name === 'muted')) db.exec('ALTER TABLE players ADD COLUMN muted INTEGER NOT NULL DEFAULT 0');
    db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  },
  // Migration 4: community drawing boards. Strokes are shared and grow, so they get a
  // table of their own rather than a JSON blob; the author is the full player id.
  (db) => {
    db.exec('CREATE TABLE IF NOT EXISTS strokes (id INTEGER PRIMARY KEY AUTOINCREMENT, board INTEGER NOT NULL, author TEXT NOT NULL, color INTEGER NOT NULL, width INTEGER NOT NULL, points BLOB NOT NULL, created INTEGER NOT NULL)');
    db.exec('CREATE INDEX IF NOT EXISTS strokes_board ON strokes(board, id)');
  },
];
export function openDatabase(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL');
  migrate(db);
  return db;
}
export function migrate(db: DatabaseSync) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = current; version < migrations.length; version++) {
    db.exec('BEGIN');
    try {
      migrations[version](db);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return migrations.length;
}
export function createPlayerStore(db: DatabaseSync) {
  const select = db.prepare('SELECT * FROM players WHERE id=?');
  const insert = db.prepare('INSERT INTO players(id,name,color) VALUES(?,?,?)');
  const update = db.prepare('UPDATE players SET name=?,color=?,coins=?,inventory=?,appearance=?,stats=? WHERE id=?');
  const setBanned = db.prepare('UPDATE players SET banned=? WHERE id=?');
  const setMuted = db.prepare('UPDATE players SET muted=? WHERE id=?');
  const listBanned = db.prepare('SELECT id,name FROM players WHERE banned=1 ORDER BY name');
  return {
    load(id: string) {
      return select.get(id) as PlayerRow | undefined;
    },
    create(id: string, name: string, color: string) {
      insert.run(id, name, color);
    },
    save(p: { id: string; name: string; color: string; coins: number; inventory: Catch[]; appearance: Appearance; stats: Stats }) {
      update.run(p.name, p.color, p.coins, JSON.stringify(p.inventory), JSON.stringify(p.appearance), JSON.stringify(p.stats), p.id);
    },
    setFlag(id: string, flag: 'banned' | 'muted', value: boolean) {
      (flag === 'banned' ? setBanned : setMuted).run(value ? 1 : 0, id);
    },
    banned() {
      return listBanned.all() as Array<{ id: string; name: string }>;
    },
  };
}
export type StrokeRow = { id: number; board: number; author: string; color: number; width: number; points: Uint8Array; created: number };
export function createBoardStore(db: DatabaseSync) {
  const list = db.prepare('SELECT id, board, author, color, width, points, created FROM strokes WHERE board=? ORDER BY id');
  const insert = db.prepare('INSERT INTO strokes(board, author, color, width, points, created) VALUES(?,?,?,?,?,?)');
  const removeAny = db.prepare('DELETE FROM strokes WHERE id=?');
  const clearMine = db.prepare('DELETE FROM strokes WHERE board=? AND author=?');
  const clearAll = db.prepare('DELETE FROM strokes WHERE board=?');
  return {
    list(board: number) {
      return list.all(board) as StrokeRow[];
    },
    add(board: number, author: string, color: number, width: number, points: Uint8Array, now: number) {
      return Number(insert.run(board, author, color, width, points, now).lastInsertRowid);
    },
    removeAny(id: number) {
      return removeAny.run(id).changes > 0;
    },
    clear(board: number, author: string | null) {
      return author === null ? clearAll.run(board).changes : clearMine.run(board, author).changes;
    },
  };
}
// Small key/value store for server-wide state: the dev role holder and any world overrides.
export function createSettingsStore(db: DatabaseSync) {
  const read = db.prepare('SELECT value FROM settings WHERE key=?');
  const write = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const remove = db.prepare('DELETE FROM settings WHERE key=?');
  return {
    get(key: string) {
      return ((read.get(key) as { value: string } | undefined)?.value ?? null) as string | null;
    },
    set(key: string, value: string | null) {
      if (value === null) remove.run(key);
      else write.run(key, value);
    },
  };
}
