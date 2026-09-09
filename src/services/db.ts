import initSqlJs, { Database } from 'sql.js';
import { Track, Artist, Playlist, PlayHistoryItem } from '../types';

let db: Database | null = null;
let isInitialized = false;

// Debounced auto-save
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

async function persistDatabase() {
  if (!db) return;
  try {
    const data = db.export();
    // 1. If running under Electron IPC
    if (typeof window !== 'undefined' && (window as any).electronAPI?.saveDatabaseBinary) {
      await (window as any).electronAPI.saveDatabaseBinary(data);
    } else {
      // 2. Browser fallback: save to localStorage (base64) or IndexedDB
      const binaryString = Array.from(data, byte => String.fromCharCode(byte)).join('');
      localStorage.setItem('aura_music_db_data', btoa(binaryString));
    }
  } catch (err) {
    console.warn('Failed to persist database:', err);
  }
}

function queueSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(persistDatabase, 1000);
}

export async function initDatabase(): Promise<Database> {
  if (db && isInitialized) return db;

  const SQL = await initSqlJs({
    locateFile: () => './sql-wasm.wasm'
  });

  let initialData: Uint8Array | null = null;

  // Attempt to load from Electron disk
  if (typeof window !== 'undefined' && (window as any).electronAPI?.loadDatabaseBinary) {
    try {
      initialData = await (window as any).electronAPI.loadDatabaseBinary();
    } catch (err) {
      console.warn('Could not load DB from electronAPI:', err);
    }
  }

  // Fallback to localStorage if no electron binary
  if (!initialData) {
    const local = localStorage.getItem('aura_music_db_data');
    if (local) {
      try {
        const binStr = atob(local);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }
        initialData = bytes;
      } catch (err) {
        console.warn('Corrupted local DB storage, starting fresh:', err);
      }
    }
  }

  if (initialData) {
    db = new SQL.Database(initialData);
  } else {
    db = new SQL.Database();
  }

  // Create tables if not exist
  db.run(`
    CREATE TABLE IF NOT EXISTS artists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      thumbnail_url TEXT,
      subscribers TEXT,
      description TEXT,
      last_synced_at INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist_name TEXT,
      artist_id TEXT,
      album TEXT,
      duration INTEGER DEFAULT 0,
      thumbnail_url TEXT,
      is_liked INTEGER DEFAULT 0,
      is_new_release INTEGER DEFAULT 0,
      published_at TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      is_smart INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id TEXT,
      track_id TEXT,
      position INTEGER DEFAULT 0,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, track_id)
    );

    CREATE TABLE IF NOT EXISTS stream_cache (
      video_id TEXT PRIMARY KEY,
      stream_url TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS play_history (
      track_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT,
      artist_id TEXT,
      album TEXT,
      duration INTEGER DEFAULT 0,
      thumbnail_url TEXT,
      listened_at INTEGER NOT NULL,
      play_count INTEGER DEFAULT 1,
      completed_count INTEGER DEFAULT 0,
      skip_count INTEGER DEFAULT 0,
      is_liked INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Ensure default Smart Radar Playlist exists
  const res = db.exec("SELECT id FROM playlists WHERE is_smart = 1 LIMIT 1;");
  if (!res.length || !res[0].values.length) {
    db.run(
      "INSERT INTO playlists (id, title, is_smart, created_at) VALUES (?, ?, 1, ?);",
      ['smart_radar', 'Artist Radar (New Releases)', Date.now()]
    );
  }

  queueSave();
  isInitialized = true;
  return db;
}

// ----------------- ARTISTS -----------------
export async function getTrackedArtists(): Promise<Artist[]> {
  const database = await initDatabase();
  const res = database.exec(`
    SELECT a.id, a.name, a.thumbnail_url, a.subscribers, a.description, a.last_synced_at, a.created_at,
           COUNT(t.id) as total_tracks
    FROM artists a
    LEFT JOIN tracks t ON t.artist_id = a.id
    GROUP BY a.id
    ORDER BY a.created_at DESC;
  `);

  if (!res.length || !res[0].values.length) return [];

  return res[0].values.map(row => ({
    id: String(row[0]),
    name: String(row[1]),
    thumbnail: String(row[2] || ''),
    subscribers: row[3] ? String(row[3]) : undefined,
    description: row[4] ? String(row[4]) : undefined,
    lastSyncedAt: Number(row[5] || 0),
    trackedAt: Number(row[6] || 0),
    totalTracks: Number(row[7] || 0),
  }));
}

export async function isArtistTracked(artistId: string): Promise<boolean> {
  const database = await initDatabase();
  const stmt = database.prepare("SELECT 1 FROM artists WHERE id = :id LIMIT 1;");
  stmt.bind({ ':id': artistId });
  const has = stmt.step();
  stmt.free();
  return has;
}

export async function trackArtist(artist: Artist): Promise<void> {
  const database = await initDatabase();
  database.run(
    `INSERT OR REPLACE INTO artists (id, name, thumbnail_url, subscribers, description, last_synced_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [
      artist.id,
      artist.name,
      artist.thumbnail,
      artist.subscribers || '',
      artist.description || '',
      artist.lastSyncedAt || 0,
      artist.trackedAt || Date.now()
    ]
  );
  queueSave();
}

export async function untrackArtist(artistId: string): Promise<void> {
  const database = await initDatabase();
  database.run("DELETE FROM artists WHERE id = ?;", [artistId]);
  queueSave();
}

export const unfollowArtist = untrackArtist;

export async function updateArtistSyncTime(artistId: string, timestamp = Date.now()): Promise<void> {
  const database = await initDatabase();
  database.run("UPDATE artists SET last_synced_at = ? WHERE id = ?;", [timestamp, artistId]);
  queueSave();
}

// ----------------- TRACKS -----------------
export async function saveTracks(tracks: Track[], markNewRelease = false): Promise<void> {
  if (!tracks.length) return;
  const database = await initDatabase();
  const now = Date.now();

  for (const t of tracks) {
    database.run(
      `INSERT INTO tracks (id, title, artist_name, artist_id, album, duration, thumbnail_url, is_new_release, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title,
         artist_name=excluded.artist_name,
         thumbnail_url=excluded.thumbnail_url,
         is_new_release=excluded.is_new_release;`,
      [
        t.id,
        t.title,
        t.artist,
        t.artistId || '',
        t.album || '',
        t.duration || 0,
        t.thumbnail,
        markNewRelease ? 1 : (t.isNewRelease ? 1 : 0),
        t.publishedAt || '',
        now
      ]
    );

    // If marked as new release, automatically add to smart radar playlist
    if (markNewRelease || t.isNewRelease) {
      database.run(
        `INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at)
         VALUES ('smart_radar', ?, 0, ?);`,
        [t.id, now]
      );
    }
  }
  queueSave();
}

export async function getRadarTracks(): Promise<Track[]> {
  const database = await initDatabase();
  const res = database.exec(`
    SELECT t.id, t.title, t.artist_name, t.artist_id, t.album, t.duration, t.thumbnail_url, t.is_liked, t.is_new_release, t.published_at, pt.added_at
    FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = 'smart_radar'
    ORDER BY pt.added_at DESC;
  `);

  if (!res.length || !res[0].values.length) return [];

  return res[0].values.map(row => ({
    id: String(row[0]),
    title: String(row[1]),
    artist: String(row[2] || 'Unknown Artist'),
    artistId: String(row[3] || ''),
    album: String(row[4] || ''),
    duration: Number(row[5] || 0),
    thumbnail: String(row[6] || ''),
    isLiked: Boolean(row[7]),
    isNewRelease: Boolean(row[8]),
    publishedAt: String(row[9] || ''),
  }));
}

export async function toggleLikeTrack(track: Track): Promise<boolean> {
  const database = await initDatabase();
  const res = database.exec(`SELECT is_liked FROM tracks WHERE id = '${track.id}' LIMIT 1;`);
  let newLikedState = 1;
  if (res.length && res[0].values.length) {
    newLikedState = res[0].values[0][0] === 1 ? 0 : 1;
    database.run("UPDATE tracks SET is_liked = ? WHERE id = ?;", [newLikedState, track.id]);
  } else {
    // Insert if track wasn't saved yet
    database.run(
      `INSERT INTO tracks (id, title, artist_name, artist_id, album, duration, thumbnail_url, is_liked, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?);`,
      [track.id, track.title, track.artist, track.artistId || '', track.album || '', track.duration || 0, track.thumbnail, Date.now()]
    );
  }

  // Also sync like state into play_history if exists
  database.run("UPDATE play_history SET is_liked = ? WHERE track_id = ?;", [newLikedState, track.id]);

  queueSave();
  return newLikedState === 1;
}

export async function getLikedTracks(): Promise<Track[]> {
  const database = await initDatabase();
  const res = database.exec(`
    SELECT id, title, artist_name, artist_id, album, duration, thumbnail_url, is_liked, is_new_release, published_at
    FROM tracks
    WHERE is_liked = 1
    ORDER BY created_at DESC;
  `);

  if (!res.length || !res[0].values.length) return [];

  return res[0].values.map(row => ({
    id: String(row[0]),
    title: String(row[1]),
    artist: String(row[2] || 'Unknown Artist'),
    artistId: String(row[3] || ''),
    album: String(row[4] || ''),
    duration: Number(row[5] || 0),
    thumbnail: String(row[6] || ''),
    isLiked: true,
    isNewRelease: Boolean(row[8]),
    publishedAt: String(row[9] || ''),
  }));
}

// ----------------- LOCAL PLAY HISTORY & BEHAVIOR TRACKING -----------------

/**
 * Ghi lại bài hát vừa bắt đầu phát: tăng play_count và cập nhật thời điểm nghe
 */
export async function recordTrackPlay(track: Track): Promise<void> {
  try {
    const database = await initDatabase();
    const now = Date.now();

    // 1. Lưu hoặc cập nhật bảng tracks
    database.run(
      `INSERT INTO tracks (id, title, artist_name, artist_id, album, duration, thumbnail_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         artist_name = excluded.artist_name,
         thumbnail_url = excluded.thumbnail_url;`,
      [track.id, track.title, track.artist, track.artistId || '', track.album || '', track.duration || 0, track.thumbnail, now]
    );

    // 2. Ghi nhận vào bảng play_history
    database.run(
      `INSERT INTO play_history (track_id, title, artist, artist_id, album, duration, thumbnail_url, listened_at, play_count, completed_count, skip_count, is_liked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, ?)
       ON CONFLICT(track_id) DO UPDATE SET
         title = excluded.title,
         artist = excluded.artist,
         thumbnail_url = excluded.thumbnail_url,
         listened_at = excluded.listened_at,
         play_count = play_count + 1;`,
      [track.id, track.title, track.artist, track.artistId || '', track.album || '', track.duration || 0, track.thumbnail, now, track.isLiked ? 1 : 0]
    );

    queueSave();
  } catch (err) {
    console.warn('Failed to record track play:', err);
  }
}

/**
 * Ghi nhận bài hát đã được nghe trọn vẹn
 */
export async function recordTrackCompleted(trackId: string): Promise<void> {
  try {
    const database = await initDatabase();
    database.run("UPDATE play_history SET completed_count = completed_count + 1 WHERE track_id = ?;", [trackId]);
    queueSave();
  } catch (err) {
    console.warn('Failed to record completed count:', err);
  }
}

/**
 * Ghi nhận bài hát bị bỏ qua sớm (skip trong 30s đầu)
 */
export async function recordTrackSkipped(trackId: string): Promise<void> {
  try {
    const database = await initDatabase();
    database.run("UPDATE play_history SET skip_count = skip_count + 1 WHERE track_id = ?;", [trackId]);
    queueSave();
  } catch (err) {
    console.warn('Failed to record skip count:', err);
  }
}

/**
 * Trích xuất 20-30 bài hát có điểm tương tác cao nhất (Thả tim + Nghe trọn vẹn + Số lần phát)
 */
export async function getTopInteractedTracks(limit = 30): Promise<PlayHistoryItem[]> {
  const database = await initDatabase();
  const res = database.exec(`
    SELECT track_id, title, artist, artist_id, album, duration, thumbnail_url, listened_at, play_count, completed_count, skip_count, is_liked,
           (is_liked * 10 + play_count * 2 + completed_count - skip_count) AS interaction_score
    FROM play_history
    ORDER BY interaction_score DESC, listened_at DESC
    LIMIT ${Number(limit)};
  `);

  if (!res.length || !res[0].values.length) return [];

  return res[0].values.map(row => ({
    trackId: String(row[0]),
    title: String(row[1]),
    artist: String(row[2] || 'Unknown Artist'),
    artistId: String(row[3] || ''),
    album: String(row[4] || ''),
    duration: Number(row[5] || 0),
    thumbnail: String(row[6] || ''),
    listenedAt: Number(row[7] || 0),
    playCount: Number(row[8] || 0),
    completedCount: Number(row[9] || 0),
    skipCount: Number(row[10] || 0),
    isLiked: Boolean(row[11]),
  }));
}

/**
 * Lấy danh sách lịch sử nghe gần nhất
 */
export async function getPlayHistory(limit = 50): Promise<PlayHistoryItem[]> {
  const database = await initDatabase();
  const res = database.exec(`
    SELECT track_id, title, artist, artist_id, album, duration, thumbnail_url, listened_at, play_count, completed_count, skip_count, is_liked
    FROM play_history
    ORDER BY listened_at DESC
    LIMIT ${Number(limit)};
  `);

  if (!res.length || !res[0].values.length) return [];

  return res[0].values.map(row => ({
    trackId: String(row[0]),
    title: String(row[1]),
    artist: String(row[2] || 'Unknown Artist'),
    artistId: String(row[3] || ''),
    album: String(row[4] || ''),
    duration: Number(row[5] || 0),
    thumbnail: String(row[6] || ''),
    listenedAt: Number(row[7] || 0),
    playCount: Number(row[8] || 0),
    completedCount: Number(row[9] || 0),
    skipCount: Number(row[10] || 0),
    isLiked: Boolean(row[11]),
  }));
}

// ----------------- STREAM CACHE -----------------
export async function getCachedStream(videoId: string): Promise<string | null> {
  const database = await initDatabase();
  const now = Date.now();
  const stmt = database.prepare("SELECT stream_url, expires_at FROM stream_cache WHERE video_id = :id;");
  stmt.bind({ ':id': videoId });
  if (stmt.step()) {
    const row = stmt.get();
    stmt.free();
    const expiresAt = Number(row[1]);
    if (expiresAt > now) {
      return String(row[0]);
    }
  } else {
    stmt.free();
  }
  return null;
}

export async function saveStreamCache(videoId: string, streamUrl: string, ttlSeconds = 3600 * 4): Promise<void> {
  const database = await initDatabase();
  const expiresAt = Date.now() + ttlSeconds * 1000;
  database.run(
    "INSERT OR REPLACE INTO stream_cache (video_id, stream_url, expires_at) VALUES (?, ?, ?);",
    [videoId, streamUrl, expiresAt]
  );
  queueSave();
}

// ----------------- APP SETTINGS (SQLITE) -----------------
export async function saveAppSetting(key: string, value: string): Promise<void> {
  try {
    const database = await initDatabase();
    database.run(
      "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?);",
      [key, value, Date.now()]
    );
    queueSave();
  } catch (err) {
    console.warn('Failed to save app setting to SQLite:', err);
  }
}

export async function getAppSetting(key: string): Promise<string | null> {
  try {
    const database = await initDatabase();
    const stmt = database.prepare("SELECT value FROM app_settings WHERE key = :k;");
    stmt.bind({ ':k': key });
    if (stmt.step()) {
      const row = stmt.get();
      stmt.free();
      return String(row[0]);
    }
    stmt.free();
  } catch (err) {
    console.warn('Failed to get app setting from SQLite:', err);
  }
  return null;
}

