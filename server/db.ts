import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';

export interface DbUser {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
  created_at: string;
}

export interface DbPlaybackState {
  user_id: number;
  last_track_json: string | null;
  progress_seconds: number;
  queue_json: string | null;
  volume: number;
  updated_at: string;
}

export interface DbFavorite {
  id: number;
  user_id: number;
  track_id: string;
  track_json: string;
  created_at: string;
}

import fs from 'fs';

// Database file path: music_player.db in root directory or custom DB_PATH
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(process.cwd(), 'music_player.db');

// Ensure parent directory exists (e.g. /app/data)
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

// Enable WAL mode for high concurrency and performance
db.pragma('journal_mode = WAL');

/**
 * Initialize all database tables and seed default Admin account if empty
 */
export function initSQLiteDatabase(): void {
  // 1. users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')) DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. playback_state table
  db.exec(`
    CREATE TABLE IF NOT EXISTS playback_state (
      user_id INTEGER PRIMARY KEY,
      last_track_json TEXT,
      progress_seconds REAL DEFAULT 0,
      queue_json TEXT,
      volume REAL DEFAULT 0.85,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 3. favorites table
  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      track_id TEXT NOT NULL,
      track_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, track_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 4. tracks_cache table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks_cache (
      track_id TEXT PRIMARY KEY,
      title TEXT,
      artist TEXT,
      duration INTEGER,
      stream_url TEXT,
      expires_at INTEGER
    );
  `);

  // Seed default admin account if users table is empty
  const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (countRow.count === 0) {
    console.log('[SQLite DB] Seeding default Admin account: admin / admin123');
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('admin123', salt);
    db.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, 'admin')
    `).run('admin', hash);
  }
}

// ----------------- USER REPOSITORY -----------------

export function getUserByUsername(username: string): DbUser | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as DbUser | undefined;
}

export function getUserById(id: number): DbUser | undefined {
  return db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(id) as DbUser | undefined;
}

export function listUsers(): Omit<DbUser, 'password_hash'>[] {
  return db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id ASC').all() as Omit<DbUser, 'password_hash'>[];
}

export function createUser(username: string, passwordPlain: string, role: 'admin' | 'user'): Omit<DbUser, 'password_hash'> {
  const hash = bcrypt.hashSync(passwordPlain, 10);
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, role)
    VALUES (?, ?, ?)
  `).run(username, hash, role);

  return {
    id: Number(result.lastInsertRowid),
    username,
    role,
    created_at: new Date().toISOString()
  };
}

export function deleteUser(id: number): boolean {
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return info.changes > 0;
}

// ----------------- PLAYBACK STATE REPOSITORY -----------------

export function savePlaybackState(
  userId: number,
  lastTrack: any,
  progressSeconds: number,
  queue: any[],
  volume: number
): void {
  const lastTrackJson = lastTrack ? JSON.stringify(lastTrack) : null;
  const queueJson = queue && queue.length ? JSON.stringify(queue) : null;

  db.prepare(`
    INSERT INTO playback_state (user_id, last_track_json, progress_seconds, queue_json, volume, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      last_track_json = excluded.last_track_json,
      progress_seconds = excluded.progress_seconds,
      queue_json = excluded.queue_json,
      volume = excluded.volume,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, lastTrackJson, progressSeconds, queueJson, volume);
}

export function getPlaybackState(userId: number): {
  lastTrack: any | null;
  progressSeconds: number;
  queue: any[];
  volume: number;
  updatedAt: string;
} | null {
  const row = db.prepare('SELECT * FROM playback_state WHERE user_id = ?').get(userId) as DbPlaybackState | undefined;
  if (!row) return null;

  let lastTrack = null;
  let queue: any[] = [];
  try {
    if (row.last_track_json) lastTrack = JSON.parse(row.last_track_json);
  } catch {}
  try {
    if (row.queue_json) queue = JSON.parse(row.queue_json);
  } catch {}

  return {
    lastTrack,
    progressSeconds: row.progress_seconds || 0,
    queue,
    volume: row.volume !== undefined ? row.volume : 0.85,
    updatedAt: row.updated_at
  };
}

// ----------------- FAVORITES REPOSITORY -----------------

export function getFavorites(userId: number): any[] {
  const rows = db.prepare('SELECT track_json FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(userId) as { track_json: string }[];
  const tracks: any[] = [];
  for (const r of rows) {
    try {
      tracks.push(JSON.parse(r.track_json));
    } catch {}
  }
  return tracks;
}

export function toggleFavorite(userId: number, track: any): boolean {
  if (!track || !track.id) return false;
  const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND track_id = ?').get(userId, track.id);
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND track_id = ?').run(userId, track.id);
    return false; // un-liked
  } else {
    db.prepare(`
      INSERT INTO favorites (user_id, track_id, track_json)
      VALUES (?, ?, ?)
    `).run(userId, track.id, JSON.stringify(track));
    return true; // liked
  }
}

// ----------------- TRACKS CACHE REPOSITORY -----------------

export function getCachedTrackStream(trackId: string): string | null {
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare('SELECT stream_url FROM tracks_cache WHERE track_id = ? AND expires_at > ?').get(trackId, now) as { stream_url: string } | undefined;
  return row ? row.stream_url : null;
}

export function saveCachedTrackStream(trackId: string, streamUrl: string, ttlSeconds: number): void {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  db.prepare(`
    INSERT INTO tracks_cache (track_id, stream_url, expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(track_id) DO UPDATE SET
      stream_url = excluded.stream_url,
      expires_at = excluded.expires_at
  `).run(trackId, streamUrl, expiresAt);
}

// Initialize on module load
initSQLiteDatabase();
