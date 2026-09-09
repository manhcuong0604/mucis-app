// server/prod.ts
import http2 from "http";
import fs2 from "fs";
import path2 from "path";
import { fileURLToPath } from "url";

// server/db.ts
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";
var dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.resolve(process.cwd(), "music_player.db");
var dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
var db = new Database(dbPath);
db.pragma("journal_mode = WAL");
function initSQLiteDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')) DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
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
  const countRow = db.prepare("SELECT COUNT(*) as count FROM users").get();
  if (countRow.count === 0) {
    console.log("[SQLite DB] Seeding default Admin account: admin / admin123");
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync("admin123", salt);
    db.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, 'admin')
    `).run("admin", hash);
  }
}
function getUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
}
function getUserById(id) {
  return db.prepare("SELECT id, username, role, created_at FROM users WHERE id = ?").get(id);
}
function listUsers() {
  return db.prepare("SELECT id, username, role, created_at FROM users ORDER BY id ASC").all();
}
function createUser(username, passwordPlain, role) {
  const hash = bcrypt.hashSync(passwordPlain, 10);
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, role)
    VALUES (?, ?, ?)
  `).run(username, hash, role);
  return {
    id: Number(result.lastInsertRowid),
    username,
    role,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function deleteUser(id) {
  const info = db.prepare("DELETE FROM users WHERE id = ?").run(id);
  return info.changes > 0;
}
function savePlaybackState(userId, lastTrack, progressSeconds, queue, volume) {
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
function getPlaybackState(userId) {
  const row = db.prepare("SELECT * FROM playback_state WHERE user_id = ?").get(userId);
  if (!row) return null;
  let lastTrack = null;
  let queue = [];
  try {
    if (row.last_track_json) lastTrack = JSON.parse(row.last_track_json);
  } catch {
  }
  try {
    if (row.queue_json) queue = JSON.parse(row.queue_json);
  } catch {
  }
  return {
    lastTrack,
    progressSeconds: row.progress_seconds || 0,
    queue,
    volume: row.volume !== void 0 ? row.volume : 0.85,
    updatedAt: row.updated_at
  };
}
function getFavorites(userId) {
  const rows = db.prepare("SELECT track_json FROM favorites WHERE user_id = ? ORDER BY created_at DESC").all(userId);
  const tracks = [];
  for (const r of rows) {
    try {
      tracks.push(JSON.parse(r.track_json));
    } catch {
    }
  }
  return tracks;
}
function toggleFavorite(userId, track) {
  if (!track || !track.id) return false;
  const existing = db.prepare("SELECT id FROM favorites WHERE user_id = ? AND track_id = ?").get(userId, track.id);
  if (existing) {
    db.prepare("DELETE FROM favorites WHERE user_id = ? AND track_id = ?").run(userId, track.id);
    return false;
  } else {
    db.prepare(`
      INSERT INTO favorites (user_id, track_id, track_json)
      VALUES (?, ?, ?)
    `).run(userId, track.id, JSON.stringify(track));
    return true;
  }
}
initSQLiteDatabase();

// server/routes.ts
import bcrypt2 from "bcryptjs";

// server/auth.ts
import jwt from "jsonwebtoken";
var JWT_SECRET = process.env.JWT_SECRET || "aura_music_jwt_secret_key_2026_super_secure";
var TOKEN_EXPIRY = "7d";
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch {
    return null;
  }
}
function authenticateRequest(req) {
  const authHeader = req.headers["authorization"] || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  const payload = verifyToken(token);
  if (!payload || !payload.id) {
    return null;
  }
  const user = getUserById(payload.id);
  return user || null;
}

// server/routes.ts
function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Range"
  });
  res.end(JSON.stringify(data));
}
function parseBody(req, timeoutMs = 8e3) {
  return new Promise((resolve, reject) => {
    let body = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("Request body timeout"));
    }, timeoutMs);
    req.on("data", (chunk) => {
      if (timedOut) return;
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) {
        clearTimeout(timer);
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (timedOut) return;
      clearTimeout(timer);
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON format in request body"));
      }
    });
    req.on("error", (err) => {
      if (timedOut) return;
      clearTimeout(timer);
      reject(err);
    });
  });
}
async function handleAppRoutes(req, res) {
  const host = req.headers.host || "127.0.0.1:3000";
  let pathname = "";
  const method = req.method || "GET";
  try {
    const parsedUrl = new URL(req.url || "", `http://${host}`);
    pathname = parsedUrl.pathname;
  } catch {
    pathname = (req.url || "").split("?")[0];
  }
  if (!pathname.startsWith("/api/auth") && !pathname.startsWith("/api/admin") && !pathname.startsWith("/api/player") && !pathname.startsWith("/api/favorites")) {
    return false;
  }
  if (method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Range"
    });
    res.end();
    return true;
  }
  try {
    if (pathname === "/api/auth/login" && method === "POST") {
      try {
        const { username, password } = await parseBody(req);
        if (!username || !password) {
          sendJson(res, { error: "Vui l\xF2ng nh\u1EADp t\xEAn \u0111\u0103ng nh\u1EADp v\xE0 m\u1EADt kh\u1EA9u." }, 400);
          return true;
        }
        const user = getUserByUsername(username.trim());
        if (!user) {
          sendJson(res, { error: "T\xE0i kho\u1EA3n ho\u1EB7c m\u1EADt kh\u1EA9u kh\xF4ng ch\xEDnh x\xE1c." }, 401);
          return true;
        }
        const isMatch = bcrypt2.compareSync(password, user.password_hash);
        if (!isMatch) {
          sendJson(res, { error: "T\xE0i kho\u1EA3n ho\u1EB7c m\u1EADt kh\u1EA9u kh\xF4ng ch\xEDnh x\xE1c." }, 401);
          return true;
        }
        const token = generateToken({ id: user.id, username: user.username, role: user.role });
        sendJson(res, {
          token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            createdAt: user.created_at
          }
        });
        return true;
      } catch (err) {
        sendJson(res, { error: err.message || "L\u1ED7i x\xE1c th\u1EF1c \u0111\u0103ng nh\u1EADp" }, 500);
        return true;
      }
    }
    if (pathname === "/api/auth/me" && method === "GET") {
      const user = authenticateRequest(req);
      if (!user) {
        sendJson(res, { error: "Ch\u01B0a \u0111\u0103ng nh\u1EADp ho\u1EB7c phi\xEAn l\xE0m vi\u1EC7c \u0111\xE3 h\u1EBFt h\u1EA1n." }, 401);
        return true;
      }
      sendJson(res, {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          createdAt: user.created_at
        }
      });
      return true;
    }
    if (pathname === "/api/admin/users" && method === "GET") {
      const user = authenticateRequest(req);
      if (!user) {
        sendJson(res, { error: "Ch\u01B0a \u0111\u0103ng nh\u1EADp." }, 401);
        return true;
      }
      if (user.role !== "admin") {
        sendJson(res, { error: "T\u1EEB ch\u1ED1i truy c\u1EADp: Quy\u1EC1n Admin l\xE0 b\u1EAFt bu\u1ED9c." }, 403);
        return true;
      }
      const users = listUsers();
      sendJson(res, users);
      return true;
    }
    if (pathname === "/api/admin/users" && method === "POST") {
      const user = authenticateRequest(req);
      if (!user) {
        sendJson(res, { error: "Ch\u01B0a \u0111\u0103ng nh\u1EADp." }, 401);
        return true;
      }
      if (user.role !== "admin") {
        sendJson(res, { error: "T\u1EEB ch\u1ED1i truy c\u1EADp: Ch\u1EC9 Admin m\u1EDBi c\xF3 quy\u1EC1n t\u1EA1o ng\u01B0\u1EDDi d\xF9ng." }, 403);
        return true;
      }
      try {
        const { username, password, role } = await parseBody(req);
        if (!username || !password) {
          sendJson(res, { error: "T\xEAn \u0111\u0103ng nh\u1EADp v\xE0 m\u1EADt kh\u1EA9u kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng." }, 400);
          return true;
        }
        if (password.length < 6) {
          sendJson(res, { error: "M\u1EADt kh\u1EA9u ph\u1EA3i c\xF3 \xEDt nh\u1EA5t 6 k\xFD t\u1EF1." }, 400);
          return true;
        }
        const assignedRole = role === "admin" ? "admin" : "user";
        const existing = getUserByUsername(username.trim());
        if (existing) {
          sendJson(res, { error: "T\xEAn t\xE0i kho\u1EA3n n\xE0y \u0111\xE3 t\u1ED3n t\u1EA1i." }, 409);
          return true;
        }
        const created = createUser(username.trim(), password, assignedRole);
        sendJson(res, { user: created }, 201);
        return true;
      } catch (err) {
        sendJson(res, { error: err.message || "L\u1ED7i khi t\u1EA1o ng\u01B0\u1EDDi d\xF9ng" }, 500);
        return true;
      }
    }
    if (pathname.startsWith("/api/admin/users/") && method === "DELETE") {
      const user = authenticateRequest(req);
      if (!user) {
        sendJson(res, { error: "Ch\u01B0a \u0111\u0103ng nh\u1EADp." }, 401);
        return true;
      }
      if (user.role !== "admin") {
        sendJson(res, { error: "T\u1EEB ch\u1ED1i truy c\u1EADp: Ch\u1EC9 Admin m\u1EDBi c\xF3 quy\u1EC1n x\xF3a ng\u01B0\u1EDDi d\xF9ng." }, 403);
        return true;
      }
      const idStr = pathname.replace("/api/admin/users/", "").trim();
      const targetId = parseInt(idStr, 10);
      if (!targetId || isNaN(targetId)) {
        sendJson(res, { error: "ID ng\u01B0\u1EDDi d\xF9ng kh\xF4ng h\u1EE3p l\u1EC7." }, 400);
        return true;
      }
      if (targetId === user.id) {
        sendJson(res, { error: "Kh\xF4ng th\u1EC3 t\u1EF1 x\xF3a ch\xEDnh t\xE0i kho\u1EA3n Admin \u0111ang \u0111\u0103ng nh\u1EADp." }, 400);
        return true;
      }
      const success = deleteUser(targetId);
      if (success) {
        sendJson(res, { success: true, message: "\u0110\xE3 x\xF3a ng\u01B0\u1EDDi d\xF9ng th\xE0nh c\xF4ng." });
      } else {
        sendJson(res, { error: "Kh\xF4ng t\xECm th\u1EA5y ng\u01B0\u1EDDi d\xF9ng c\u1EA7n x\xF3a." }, 404);
      }
      return true;
    }
    if (pathname === "/api/player/state" && method === "GET") {
      const user = authenticateRequest(req);
      if (!user) {
        sendJson(res, { error: "Ch\u01B0a \u0111\u0103ng nh\u1EADp." }, 401);
        return true;
      }
      const state = getPlaybackState(user.id);
      sendJson(res, state || { lastTrack: null, progressSeconds: 0, queue: [], volume: 0.85 });
      return true;
    }
    if (pathname === "/api/player/state" && method === "POST") {
      const user = authenticateRequest(req);
      if (!user) {
        sendJson(res, { error: "Ch\u01B0a \u0111\u0103ng nh\u1EADp." }, 401);
        return true;
      }
      try {
        const { lastTrack, progressSeconds, queue, volume } = await parseBody(req);
        savePlaybackState(
          user.id,
          lastTrack,
          Number(progressSeconds) || 0,
          Array.isArray(queue) ? queue : [],
          volume !== void 0 ? Number(volume) : 0.85
        );
        sendJson(res, { success: true });
        return true;
      } catch (err) {
        sendJson(res, { error: err.message || "L\u1ED7i khi l\u01B0u ti\u1EBFn tr\xECnh ph\xE1t" }, 500);
        return true;
      }
    }
    if (pathname === "/api/favorites" && method === "GET") {
      const user = authenticateRequest(req);
      if (!user) {
        sendJson(res, { error: "Ch\u01B0a \u0111\u0103ng nh\u1EADp." }, 401);
        return true;
      }
      const tracks = getFavorites(user.id);
      sendJson(res, tracks);
      return true;
    }
    if (pathname === "/api/favorites/toggle" && method === "POST") {
      const user = authenticateRequest(req);
      if (!user) {
        sendJson(res, { error: "Ch\u01B0a \u0111\u0103ng nh\u1EADp." }, 401);
        return true;
      }
      try {
        const { track } = await parseBody(req);
        if (!track || !track.id) {
          sendJson(res, { error: "Thi\u1EBFu th\xF4ng tin track" }, 400);
          return true;
        }
        const isLiked = toggleFavorite(user.id, track);
        sendJson(res, { isLiked, trackId: track.id });
        return true;
      } catch (err) {
        sendJson(res, { error: err.message || "L\u1ED7i l\u01B0u b\xE0i h\xE1t y\xEAu th\xEDch" }, 500);
        return true;
      }
    }
  } catch (err) {
    console.error("[AppRoutes Master Error]", err);
    if (!res.headersSent) {
      sendJson(res, { error: err?.message || "Internal Server Error" }, 500);
    }
    return true;
  }
  return false;
}

// vite-dev-backend.ts
import { spawn } from "child_process";
import net from "net";
import http from "http";
import https from "https";
var PYTHON_PORT = 47823;
var INVIDIOUS_INSTANCES = [
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://invidious.flokinet.to",
  "https://invidious.projectsegfau.lt"
];
var pythonProcess = null;
function checkPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(600);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, "127.0.0.1");
  });
}
function autoStartPythonBackend() {
  checkPortOpen(PYTHON_PORT).then((isOpen) => {
    if (isOpen) {
      console.log(`[Mucis Backend] Python service is already running on port ${PYTHON_PORT}`);
      return;
    }
    console.log(`[Mucis Backend] Starting Python backend microservice on port ${PYTHON_PORT}...`);
    try {
      const pyCmd = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
      pythonProcess = spawn(pyCmd, ["backend/server.py", String(PYTHON_PORT)], {
        stdio: "inherit",
        windowsHide: true,
        shell: process.platform === "win32"
      });
      pythonProcess.on("error", (err) => {
        console.warn("[Aura Backend] Python spawn notice:", err.message);
      });
    } catch (e) {
      console.warn("[Aura Backend] Could not start python process:", e.message);
    }
  });
}
function stopPythonBackend() {
  if (pythonProcess) {
    try {
      pythonProcess.kill();
    } catch {
    }
    pythonProcess = null;
  }
}
function sendJson2(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Range"
  });
  res.end(JSON.stringify(data));
}
async function nodeFallbackSearch(query, filter) {
  const type = filter === "artists" ? "channel" : "video";
  for (const inst of INVIDIOUS_INSTANCES) {
    try {
      const resp = await fetch(`${inst}/api/v1/search?q=${encodeURIComponent(query)}&type=${type}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        signal: AbortSignal.timeout(4e3)
      });
      if (resp.ok) {
        const items = await resp.json();
        if (filter === "artists") {
          return items.slice(0, 15).map((c) => ({
            id: c.authorId || "",
            name: c.author || query,
            thumbnail: c.authorThumbnails?.[c.authorThumbnails.length - 1]?.url || "",
            subscribers: c.subCount ? `${c.subCount} subs` : void 0
          }));
        } else {
          return items.slice(0, 25).map((v) => ({
            id: v.videoId,
            title: v.title,
            artist: v.author,
            artistId: v.authorId,
            album: "",
            duration: v.lengthSeconds || 0,
            thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
          }));
        }
      }
    } catch {
    }
  }
  return [];
}
async function nodeFallbackSuggestions(query) {
  try {
    const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      signal: AbortSignal.timeout(3e3)
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.[1])) {
        return data[1].slice(0, 8);
      }
    }
  } catch {
  }
  return [];
}
async function nodeFallbackArtist(artistId) {
  for (const inst of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${inst}/api/v1/channels/${encodeURIComponent(artistId)}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(4e3)
      });
      if (res.ok) {
        const data = await res.json();
        const topSongs = (data.latestVideos || []).slice(0, 20).map((v) => ({
          id: v.videoId,
          title: v.title,
          artist: data.author,
          artistId: data.authorId,
          duration: v.lengthSeconds || 0,
          thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
        }));
        return {
          id: data.authorId,
          name: data.author,
          description: data.description || "",
          subscribers: data.subCount ? `${data.subCount} ng\u01B0\u1EDDi \u0111\u0103ng k\xFD` : "",
          thumbnail: data.authorThumbnails?.[data.authorThumbnails.length - 1]?.url || "",
          topSongs,
          singles: [],
          albums: []
        };
      }
    } catch {
    }
  }
  return { id: artistId, name: "Ngh\u1EC7 s\u0129", topSongs: [], singles: [], albums: [] };
}
async function nodeFallbackStream(videoId) {
  for (const inst of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${inst}/api/v1/videos/${encodeURIComponent(videoId)}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(4500)
      });
      if (res.ok) {
        const data = await res.json();
        const audioFormats = (data.adaptiveFormats || []).filter((f) => f.type && f.type.startsWith("audio/"));
        if (audioFormats.length > 0) {
          audioFormats.sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
          const url = audioFormats[0].url;
          if (url) {
            return {
              streamUrl: url,
              duration: data.lengthSeconds || 0,
              proxyUrl: `/api/stream_proxy?url=${encodeURIComponent(url)}`
            };
          }
        }
        const fallbackUrl = `${inst}/latest_version?id=${videoId}&itag=140`;
        return {
          streamUrl: fallbackUrl,
          duration: data.lengthSeconds || 0,
          proxyUrl: `/api/stream_proxy?url=${encodeURIComponent(fallbackUrl)}`
        };
      }
    } catch {
    }
  }
  throw new Error(`Cannot resolve stream for video ${videoId}`);
}
async function handleNodeApiRequest(req, res) {
  const host = req.headers.host || "127.0.0.1:3000";
  let parsedUrl;
  try {
    parsedUrl = new URL(req.url || "", `http://${host}`);
  } catch {
    parsedUrl = new URL(req.url || "", "http://127.0.0.1:3000");
  }
  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range"
    });
    res.end();
    return;
  }
  try {
    if (pathname === "/api/health") {
      sendJson2(res, { status: "ok", engine: "aura-node-proxy-fallback" });
      return;
    }
    if (pathname === "/api/search") {
      const q = searchParams.get("q") || "";
      const filter = searchParams.get("filter") || "songs";
      const results = await nodeFallbackSearch(q, filter);
      sendJson2(res, results);
      return;
    }
    if (pathname === "/api/search/suggestions") {
      const q = searchParams.get("q") || "";
      const suggestions = await nodeFallbackSuggestions(q);
      sendJson2(res, suggestions);
      return;
    }
    if (pathname === "/api/artist") {
      const id = searchParams.get("id") || "";
      const profile = await nodeFallbackArtist(id);
      sendJson2(res, profile);
      return;
    }
    if (pathname === "/api/artist/lookup") {
      const q = searchParams.get("q") || "";
      const results = await nodeFallbackSearch(q, "artists");
      if (results && results.length > 0) {
        sendJson2(res, results[0]);
      } else {
        sendJson2(res, { id: q, name: q, thumbnail: "" });
      }
      return;
    }
    if (pathname === "/api/artist/releases") {
      const id = searchParams.get("id") || "";
      const profile = await nodeFallbackArtist(id);
      sendJson2(res, profile.topSongs || []);
      return;
    }
    if (pathname === "/api/stream") {
      const id = searchParams.get("id") || "";
      const streamInfo = await nodeFallbackStream(id);
      sendJson2(res, streamInfo);
      return;
    }
    sendJson2(res, { error: "Not found" }, 404);
  } catch (err) {
    console.error("[Node Backend Handler Error]", err);
    if (!res.headersSent) {
      sendJson2(res, { error: err.message || "Internal Server Error" }, 500);
    } else {
      try {
        res.end();
      } catch {
      }
    }
  }
}
var MEMORY_STREAM_CACHE = /* @__PURE__ */ new Map();
async function resolveStreamUrlWithCache(videoId, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh) {
    const cached = MEMORY_STREAM_CACHE.get(videoId);
    if (cached && cached.expiresAt > now) {
      return cached.streamUrl;
    }
  }
  try {
    const refreshParam = forceRefresh ? "&refresh=1" : "";
    const pyRes = await fetch(`http://127.0.0.1:${PYTHON_PORT}/api/stream?id=${encodeURIComponent(videoId)}${refreshParam}`, {
      signal: AbortSignal.timeout(2e4)
    });
    if (pyRes.ok) {
      const data = await pyRes.json();
      if (data && data.streamUrl) {
        MEMORY_STREAM_CACHE.set(videoId, {
          streamUrl: data.streamUrl,
          duration: data.duration || 0,
          expiresAt: now + 45 * 60 * 1e3
        });
        return data.streamUrl;
      }
    }
  } catch (e) {
    console.error("[StreamProxy] Python fetch error:", e?.message || e);
  }
  const fb = await nodeFallbackStream(videoId);
  MEMORY_STREAM_CACHE.set(videoId, {
    streamUrl: fb.streamUrl,
    duration: fb.duration || 0,
    expiresAt: now + 45 * 60 * 1e3
  });
  return fb.streamUrl;
}
function pipeAudioUpstream(targetUrl, req, res, redirectCount = 0) {
  if (redirectCount > 3) {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "Too many redirects" }));
    }
    return;
  }
  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    if (!res.headersSent) {
      res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "Invalid upstream URL" }));
    }
    return;
  }
  const client = parsedTarget.protocol === "https:" ? https : http;
  const upstreamHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Encoding": "identity"
  };
  const clientRange = req.headers.range;
  if (clientRange) {
    upstreamHeaders["Range"] = clientRange;
  }
  const upstreamReq = client.request(targetUrl, {
    method: req.method === "HEAD" ? "HEAD" : "GET",
    headers: upstreamHeaders
  }, (upstreamRes) => {
    if ([301, 302, 303, 307, 308].includes(upstreamRes.statusCode || 0) && upstreamRes.headers.location) {
      const nextLocation = new URL(upstreamRes.headers.location, targetUrl).toString();
      pipeAudioUpstream(nextLocation, req, res, redirectCount + 1);
      return;
    }
    const statusCode = upstreamRes.statusCode || (clientRange ? 206 : 200);
    const resHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type, Authorization, bypass-tunnel-reminder",
      "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges, Content-Type",
      "Accept-Ranges": "bytes",
      "bypass-tunnel-reminder": "true",
      "Cache-Control": "no-cache"
    };
    if (upstreamRes.headers["content-type"]) {
      resHeaders["Content-Type"] = upstreamRes.headers["content-type"];
    } else {
      resHeaders["Content-Type"] = "audio/webm";
    }
    if (upstreamRes.headers["content-length"]) {
      resHeaders["Content-Length"] = upstreamRes.headers["content-length"];
    }
    if (upstreamRes.headers["content-range"]) {
      resHeaders["Content-Range"] = upstreamRes.headers["content-range"];
    }
    upstreamRes.on("error", () => {
    });
    res.on("error", () => {
      abortUpstream();
    });
    upstreamRes.pipe(res);
  });
  let isAborted = false;
  const abortUpstream = () => {
    if (!isAborted) {
      isAborted = true;
      try {
        upstreamReq.destroy();
      } catch {
      }
    }
  };
  req.on("close", abortUpstream);
  req.on("aborted", abortUpstream);
  upstreamReq.on("error", (err) => {
    if (!res.headersSent) {
      try {
        res.writeHead(502, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(JSON.stringify({ error: "Upstream stream canceled or unavailable", details: err.message }));
      } catch {
      }
    } else {
      try {
        res.destroy();
      } catch {
      }
    }
  });
  upstreamReq.end();
}
async function handleStreamProxy(req, res) {
  const host = req.headers.host || "127.0.0.1:3000";
  let parsed;
  try {
    parsed = new URL(req.url || "", `http://${host}`);
  } catch {
    parsed = new URL(req.url || "", "http://127.0.0.1:3000");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type, Authorization, bypass-tunnel-reminder",
      "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges, Content-Type",
      "Accept-Ranges": "bytes"
    });
    res.end();
    return;
  }
  const videoId = (parsed.searchParams.get("id") || parsed.searchParams.get("videoId") || "").trim();
  let targetUrl = (parsed.searchParams.get("url") || "").trim();
  if (!targetUrl && videoId) {
    try {
      targetUrl = await resolveStreamUrlWithCache(videoId);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(404, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(JSON.stringify({ error: "Stream URL not found", message: err.message }));
      }
      return;
    }
  }
  if (!targetUrl) {
    if (!res.headersSent) {
      res.writeHead(400, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify({ error: "Missing video id or url parameter" }));
    }
    return;
  }
  pipeAudioUpstream(targetUrl, req, res);
}

// server/prod.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var PORT = parseInt(process.env.PORT || "3000", 10);
var HOST = process.env.HOST || "0.0.0.0";
var PYTHON_PORT2 = 47823;
var DIST_DIR = path2.resolve(process.cwd(), "dist");
var MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8"
};
function proxyToPython(req, res) {
  const options = {
    hostname: "127.0.0.1",
    port: PYTHON_PORT2,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${PYTHON_PORT2}`
    }
  };
  const proxyReq = http2.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on("error", async () => {
    if (!res.headersSent) {
      await handleNodeApiRequest(req, res);
    }
  });
  req.pipe(proxyReq);
}
function serveStatic(req, res, pathname) {
  let safePath = path2.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  if (safePath === "/" || safePath === "") {
    safePath = "/index.html";
  }
  let filePath = path2.join(DIST_DIR, safePath);
  fs2.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path2.join(DIST_DIR, "index.html");
      fs2.stat(filePath, (fallbackErr) => {
        if (fallbackErr) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("404 Not Found - Build directory missing. Run npm run build first.");
          return;
        }
        sendStaticFile(req, res, filePath, "text/html; charset=utf-8", false);
      });
      return;
    }
    const ext = path2.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const isImmutable = pathname.startsWith("/assets/");
    sendStaticFile(req, res, filePath, contentType, isImmutable);
  });
}
function sendStaticFile(req, res, filePath, contentType, isImmutable) {
  const stat = fs2.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;
  const headers = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "bypass-tunnel-reminder": "true"
  };
  if (isImmutable) {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  } else {
    headers["Cache-Control"] = "no-cache";
  }
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const partialStart = parts[0];
    const partialEnd = parts[1];
    const start = parseInt(partialStart, 10);
    const end = partialEnd ? parseInt(partialEnd, 10) : total - 1;
    const chunkSize = end - start + 1;
    headers["Content-Range"] = `bytes ${start}-${end}/${total}`;
    headers["Content-Length"] = chunkSize;
    res.writeHead(206, headers);
    fs2.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    headers["Content-Length"] = total;
    res.writeHead(200, headers);
    fs2.createReadStream(filePath).pipe(res);
  }
}
console.log("[Mucis Production] Initializing SQLite database...");
initSQLiteDatabase();
autoStartPythonBackend();
var server = http2.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `127.0.0.1:${PORT}`;
    let parsed;
    try {
      parsed = new URL(req.url || "", `http://${host}`);
    } catch {
      parsed = new URL(req.url || "", "http://127.0.0.1:3000");
    }
    const pathname = parsed.pathname;
    if (req.method === "OPTIONS") {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Range, bypass-tunnel-reminder",
        "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges, Content-Type",
        "bypass-tunnel-reminder": "true"
      });
      res.end();
      return;
    }
    if (pathname === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ status: "ok", server: "mucis-production-server", timestamp: (/* @__PURE__ */ new Date()).toISOString() }));
      return;
    }
    if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/admin") || pathname.startsWith("/api/player") || pathname.startsWith("/api/favorites")) {
      const handled = await handleAppRoutes(req, res);
      if (handled) return;
    }
    if (pathname === "/api/stream_proxy") {
      await handleStreamProxy(req, res);
      return;
    }
    if (pathname.startsWith("/api/")) {
      proxyToPython(req, res);
      return;
    }
    serveStatic(req, res, pathname);
  } catch (err) {
    console.error("[Production Server Error]", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message || "Internal Server Error" }));
    }
  }
});
server.listen(PORT, HOST, () => {
  console.log(`=========================================`);
  console.log(`  \u{1F3B5} Mucis Production Server is running!`);
  console.log(`  \u{1F517} URL: http://${HOST}:${PORT}`);
  console.log(`  \u{1F4C1} Static: ${DIST_DIR}`);
  console.log(`  \u{1F5C4}\uFE0F Database: ${process.env.DB_PATH || "music_player.db"}`);
  console.log(`=========================================`);
});
function shutdown() {
  console.log("[Mucis Production] Shutting down server gracefully...");
  server.close(() => {
    try {
      db.close();
    } catch {
    }
    stopPythonBackend();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
