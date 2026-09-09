import http, { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initSQLiteDatabase, db } from './db';
import { handleAppRoutes } from './routes';
import {
  handleStreamProxy,
  handleNodeApiRequest,
  autoStartPythonBackend,
  stopPythonBackend
} from '../vite-dev-backend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PYTHON_PORT = 47823;
const DIST_DIR = path.resolve(process.cwd(), 'dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8'
};

/**
 * Proxy request to Python backend on port 47823
 */
function proxyToPython(req: IncomingMessage, res: ServerResponse): void {
  const options = {
    hostname: '127.0.0.1',
    port: PYTHON_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${PYTHON_PORT}`
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', async () => {
    // If Python microservice is not responding or starting, fallback to Node handler
    if (!res.headersSent) {
      await handleNodeApiRequest(req, res);
    }
  });

  req.pipe(proxyReq);
}

/**
 * Serve static files from dist directory with SPA fallback
 */
function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): void {
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '') {
    safePath = '/index.html';
  }

  let filePath = path.join(DIST_DIR, safePath);

  // Check if file exists
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA Fallback: non-file route -> dist/index.html
      filePath = path.join(DIST_DIR, 'index.html');
      fs.stat(filePath, (fallbackErr) => {
        if (fallbackErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found - Build directory missing. Run npm run build first.');
          return;
        }
        sendStaticFile(req, res, filePath, 'text/html; charset=utf-8', false);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isImmutable = pathname.startsWith('/assets/');
    sendStaticFile(req, res, filePath, contentType, isImmutable);
  });
}

function sendStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  contentType: string,
  isImmutable: boolean
): void {
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;

  const headers: Record<string, string | number> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'bypass-tunnel-reminder': 'true'
  };

  if (isImmutable) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  } else {
    headers['Cache-Control'] = 'no-cache';
  }

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const partialStart = parts[0];
    const partialEnd = parts[1];

    const start = parseInt(partialStart, 10);
    const end = partialEnd ? parseInt(partialEnd, 10) : total - 1;
    const chunkSize = end - start + 1;

    headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
    headers['Content-Length'] = chunkSize;

    res.writeHead(206, headers);
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    headers['Content-Length'] = total;
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  }
}

// 1. Initialize SQLite Database
console.log('[Mucis Production] Initializing SQLite database...');
initSQLiteDatabase();

// 2. Auto-start Python microservice
autoStartPythonBackend();

// 3. Create HTTP Server
const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `127.0.0.1:${PORT}`;
    let parsed: URL;
    try {
      parsed = new URL(req.url || '', `http://${host}`);
    } catch {
      parsed = new URL(req.url || '', 'http://127.0.0.1:3000');
    }

    const pathname = parsed.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range, bypass-tunnel-reminder',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Type',
        'bypass-tunnel-reminder': 'true'
      });
      res.end();
      return;
    }

    // Health check endpoint
    if (pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ status: 'ok', server: 'mucis-production-server', timestamp: new Date().toISOString() }));
      return;
    }

    // Auth, Admin, Player State & Favorites API
    if (
      pathname.startsWith('/api/auth') ||
      pathname.startsWith('/api/admin') ||
      pathname.startsWith('/api/player') ||
      pathname.startsWith('/api/favorites')
    ) {
      const handled = await handleAppRoutes(req, res);
      if (handled) return;
    }

    // Stream Proxy API (HTTP 206 Partial Content, Graceful Abort, In-memory Cache)
    if (pathname === '/api/stream_proxy') {
      await handleStreamProxy(req, res);
      return;
    }

    // All other /api/* routes -> forward to Python backend
    if (pathname.startsWith('/api/')) {
      proxyToPython(req, res);
      return;
    }

    // Static Frontend SPA Serving
    serveStatic(req, res, pathname);
  } catch (err: any) {
    console.error('[Production Server Error]', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`=========================================`);
  console.log(`  🎵 Mucis Production Server is running!`);
  console.log(`  🔗 URL: http://${HOST}:${PORT}`);
  console.log(`  📁 Static: ${DIST_DIR}`);
  console.log(`  🗄️ Database: ${process.env.DB_PATH || 'music_player.db'}`);
  console.log(`=========================================`);
});

// Graceful shutdown
function shutdown() {
  console.log('[Mucis Production] Shutting down server gracefully...');
  server.close(() => {
    try {
      db.close();
    } catch {}
    stopPythonBackend();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
