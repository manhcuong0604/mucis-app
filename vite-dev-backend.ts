import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import http from 'http';
import https from 'https';
import { IncomingMessage, ServerResponse } from 'http';

const PYTHON_PORT = 47823;
const INVIDIOUS_INSTANCES = [
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.flokinet.to',
  'https://invidious.projectsegfau.lt'
];

let pythonProcess: ChildProcess | null = null;

export function checkPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(600);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

export function autoStartPythonBackend(): void {
  checkPortOpen(PYTHON_PORT).then((isOpen) => {
    if (isOpen) {
      console.log(`[Mucis Backend] Python service is already running on port ${PYTHON_PORT}`);
      return;
    }

    console.log(`[Mucis Backend] Starting Python backend microservice on port ${PYTHON_PORT}...`);
    try {
      const pyCmd = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
      pythonProcess = spawn(pyCmd, ['backend/server.py', String(PYTHON_PORT)], {
        stdio: 'inherit',
        windowsHide: true,
        shell: process.platform === 'win32'
      });

      pythonProcess.on('error', (err) => {
        console.warn('[Aura Backend] Python spawn notice:', err.message);
      });
    } catch (e: any) {
      console.warn('[Aura Backend] Could not start python process:', e.message);
    }
  });
}

export function stopPythonBackend(): void {
  if (pythonProcess) {
    try {
      pythonProcess.kill();
    } catch {}
    pythonProcess = null;
  }
}

// Helper to send JSON response
function sendJson(res: ServerResponse, data: any, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range'
  });
  res.end(JSON.stringify(data));
}

// Fallback search via Invidious from Node.js (Server-side, NO CORS)
async function nodeFallbackSearch(query: string, filter: string) {
  const type = filter === 'artists' ? 'channel' : 'video';
  for (const inst of INVIDIOUS_INSTANCES) {
    try {
      const resp = await fetch(`${inst}/api/v1/search?q=${encodeURIComponent(query)}&type=${type}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(4000)
      });
      if (resp.ok) {
        const items = (await resp.json()) as any[];
        if (filter === 'artists') {
          return items.slice(0, 15).map((c: any) => ({
            id: c.authorId || '',
            name: c.author || query,
            thumbnail: c.authorThumbnails?.[c.authorThumbnails.length - 1]?.url || '',
            subscribers: c.subCount ? `${c.subCount} subs` : undefined
          }));
        } else {
          return items.slice(0, 25).map((v: any) => ({
            id: v.videoId,
            title: v.title,
            artist: v.author,
            artistId: v.authorId,
            album: '',
            duration: v.lengthSeconds || 0,
            thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
          }));
        }
      }
    } catch {
      // try next
    }
  }
  return [];
}

// Fallback search suggestions from Node.js
async function nodeFallbackSuggestions(query: string): Promise<string[]> {
  try {
    const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (Array.isArray(data?.[1])) {
        return data[1].slice(0, 8);
      }
    }
  } catch {}
  return [];
}

// Fallback artist profile from Node.js
async function nodeFallbackArtist(artistId: string) {
  for (const inst of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${inst}/api/v1/channels/${encodeURIComponent(artistId)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        const topSongs = (data.latestVideos || []).slice(0, 20).map((v: any) => ({
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
          description: data.description || '',
          subscribers: data.subCount ? `${data.subCount} người đăng ký` : '',
          thumbnail: data.authorThumbnails?.[data.authorThumbnails.length - 1]?.url || '',
          topSongs,
          singles: [],
          albums: []
        };
      }
    } catch {}
  }
  return { id: artistId, name: 'Nghệ sĩ', topSongs: [], singles: [], albums: [] };
}

// Fallback stream resolution from Node.js
async function nodeFallbackStream(videoId: string) {
  for (const inst of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${inst}/api/v1/videos/${encodeURIComponent(videoId)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(4500)
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        const audioFormats = (data.adaptiveFormats || []).filter((f: any) => f.type && f.type.startsWith('audio/'));
        if (audioFormats.length > 0) {
          audioFormats.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
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
    } catch {}
  }
  throw new Error(`Cannot resolve stream for video ${videoId}`);
}

/**
 * Handle incoming /api/... request in Node.js when Python backend is not reachable
 */
export async function handleNodeApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.headers.host || '127.0.0.1:3000';
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(req.url || '', `http://${host}`);
  } catch {
    parsedUrl = new URL(req.url || '', 'http://127.0.0.1:3000');
  }
  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range'
    });
    res.end();
    return;
  }

  try {
    if (pathname === '/api/health') {
      sendJson(res, { status: 'ok', engine: 'aura-node-proxy-fallback' });
      return;
    }

    if (pathname === '/api/search') {
      const q = searchParams.get('q') || '';
      const filter = searchParams.get('filter') || 'songs';
      const results = await nodeFallbackSearch(q, filter);
      sendJson(res, results);
      return;
    }

    if (pathname === '/api/search/suggestions') {
      const q = searchParams.get('q') || '';
      const suggestions = await nodeFallbackSuggestions(q);
      sendJson(res, suggestions);
      return;
    }

    if (pathname === '/api/artist') {
      const id = searchParams.get('id') || '';
      const profile = await nodeFallbackArtist(id);
      sendJson(res, profile);
      return;
    }

    if (pathname === '/api/artist/lookup') {
      const q = searchParams.get('q') || '';
      const results = await nodeFallbackSearch(q, 'artists');
      if (results && results.length > 0) {
        sendJson(res, results[0]);
      } else {
        sendJson(res, { id: q, name: q, thumbnail: '' });
      }
      return;
    }

    if (pathname === '/api/artist/releases') {
      const id = searchParams.get('id') || '';
      const profile = await nodeFallbackArtist(id);
      sendJson(res, profile.topSongs || []);
      return;
    }

    if (pathname === '/api/stream') {
      const id = searchParams.get('id') || '';
      const streamInfo = await nodeFallbackStream(id);
      sendJson(res, streamInfo);
      return;
    }

    sendJson(res, { error: 'Not found' }, 404);
  } catch (err: any) {
    console.error('[Node Backend Handler Error]', err);
    if (!res.headersSent) {
      sendJson(res, { error: err.message || 'Internal Server Error' }, 500);
    } else {
      try { res.end(); } catch {}
    }
  }
}

// In-memory stream resolution cache (45 minutes TTL)
interface StreamCacheEntry {
  streamUrl: string;
  duration: number;
  expiresAt: number;
}
const MEMORY_STREAM_CACHE = new Map<string, StreamCacheEntry>();

export async function resolveStreamUrlWithCache(videoId: string, forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh) {
    const cached = MEMORY_STREAM_CACHE.get(videoId);
    if (cached && cached.expiresAt > now) {
      return cached.streamUrl;
    }
  }

  // 1. Lấy stream qua Python backend trên port 47823 (sử dụng yt-dlp native extraction)
  try {
    const refreshParam = forceRefresh ? '&refresh=1' : '';
    const pyRes = await fetch(`http://127.0.0.1:${PYTHON_PORT}/api/stream?id=${encodeURIComponent(videoId)}${refreshParam}`, {
      signal: AbortSignal.timeout(20000)
    });
    if (pyRes.ok) {
      const data = (await pyRes.json()) as any;
      if (data && data.streamUrl) {
        // Cache ngắn hạn in-memory 45 phút (2700s) theo videoId
        MEMORY_STREAM_CACHE.set(videoId, {
          streamUrl: data.streamUrl,
          duration: data.duration || 0,
          expiresAt: now + 45 * 60 * 1000
        });
        return data.streamUrl;
      }
    }
  } catch (e: any) {
    console.error('[StreamProxy] Python fetch error:', e?.message || e);
  }

  // 2. Fallback qua Invidious / Piped từ Node.js
  const fb = await nodeFallbackStream(videoId);
  MEMORY_STREAM_CACHE.set(videoId, {
    streamUrl: fb.streamUrl,
    duration: fb.duration || 0,
    expiresAt: now + 45 * 60 * 1000
  });
  return fb.streamUrl;
}

function pipeAudioUpstream(targetUrl: string, req: IncomingMessage, res: ServerResponse, redirectCount = 0): void {
  if (redirectCount > 3) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Too many redirects' }));
    }
    return;
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    if (!res.headersSent) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Invalid upstream URL' }));
    }
    return;
  }

  const client = parsedTarget.protocol === 'https:' ? https : http;
  const upstreamHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'identity'
  };

  const clientRange = req.headers.range;
  if (clientRange) {
    upstreamHeaders['Range'] = clientRange;
  }

  const upstreamReq = client.request(targetUrl, {
    method: req.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: upstreamHeaders
  }, (upstreamRes) => {
    // Tự động follow redirects (301, 302, 307, 308)
    if ([301, 302, 303, 307, 308].includes(upstreamRes.statusCode || 0) && upstreamRes.headers.location) {
      const nextLocation = new URL(upstreamRes.headers.location, targetUrl).toString();
      pipeAudioUpstream(nextLocation, req, res, redirectCount + 1);
      return;
    }

    const statusCode = upstreamRes.statusCode || (clientRange ? 206 : 200);

    const resHeaders: Record<string, string | string[]> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization, bypass-tunnel-reminder',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Type',
      'Accept-Ranges': 'bytes',
      'bypass-tunnel-reminder': 'true',
      'Cache-Control': 'no-cache'
    };

    if (upstreamRes.headers['content-type']) {
      resHeaders['Content-Type'] = upstreamRes.headers['content-type'];
    } else {
      resHeaders['Content-Type'] = 'audio/webm';
    }

    if (upstreamRes.headers['content-length']) {
      resHeaders['Content-Length'] = upstreamRes.headers['content-length'];
    }

    if (upstreamRes.headers['content-range']) {
      resHeaders['Content-Range'] = upstreamRes.headers['content-range'];
    }

    upstreamRes.on('error', () => {});
    res.on('error', () => {
      abortUpstream();
    });

    upstreamRes.pipe(res);
  });

  // 2. Graceful Abort: Lắng nghe req.on('close') và req.on('aborted') để hủy ngay socket upstream khi client seek/skip
  let isAborted = false;
  const abortUpstream = () => {
    if (!isAborted) {
      isAborted = true;
      try {
        upstreamReq.destroy();
      } catch {}
    }
  };

  req.on('close', abortUpstream);
  req.on('aborted', abortUpstream);

  upstreamReq.on('error', (err: any) => {
    if (!res.headersSent) {
      try {
        res.writeHead(502, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ error: 'Upstream stream canceled or unavailable', details: err.message }));
      } catch {}
    } else {
      try {
        res.destroy();
      } catch {}
    }
  });

  upstreamReq.end();
}

export async function handleStreamProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.headers.host || '127.0.0.1:3000';
  let parsed: URL;
  try {
    parsed = new URL(req.url || '', `http://${host}`);
  } catch {
    parsed = new URL(req.url || '', 'http://127.0.0.1:3000');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization, bypass-tunnel-reminder',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Type',
      'Accept-Ranges': 'bytes'
    });
    res.end();
    return;
  }

  const videoId = (parsed.searchParams.get('id') || parsed.searchParams.get('videoId') || '').trim();
  let targetUrl = (parsed.searchParams.get('url') || '').trim();

  // 3. Tối ưu tốc độ lấy stream: Kiểm tra cache và phân giải link stream on-the-fly
  if (!targetUrl && videoId) {
    try {
      targetUrl = await resolveStreamUrlWithCache(videoId);
    } catch (err: any) {
      if (!res.headersSent) {
        res.writeHead(404, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ error: 'Stream URL not found', message: err.message }));
      }
      return;
    }
  }

  if (!targetUrl) {
    if (!res.headersSent) {
      res.writeHead(400, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: 'Missing video id or url parameter' }));
    }
    return;
  }

  pipeAudioUpstream(targetUrl, req, res);
}

