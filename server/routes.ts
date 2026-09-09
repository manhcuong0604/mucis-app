import { IncomingMessage, ServerResponse } from 'http';
import bcrypt from 'bcryptjs';
import {
  getUserByUsername,
  listUsers,
  createUser,
  deleteUser,
  savePlaybackState,
  getPlaybackState,
  getFavorites,
  toggleFavorite
} from './db';
import { generateToken, authenticateRequest } from './auth';

function sendJson(res: ServerResponse, data: any, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range'
  });
  res.end(JSON.stringify(data));
}

function parseBody<T = any>(req: IncomingMessage, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error('Request body timeout'));
    }, timeoutMs);

    req.on('data', chunk => {
      if (timedOut) return;
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) {
        clearTimeout(timer);
        reject(new Error('Payload too large'));
      }
    });

    req.on('end', () => {
      if (timedOut) return;
      clearTimeout(timer);
      try {
        resolve(body ? JSON.parse(body) : ({} as T));
      } catch {
        reject(new Error('Invalid JSON format in request body'));
      }
    });

    req.on('error', (err) => {
      if (timedOut) return;
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Handle API requests for Auth, Admin RBAC, Playback State & Favorites.
 * Returns true if the request was handled by this router, false otherwise.
 */
export async function handleAppRoutes(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const host = req.headers.host || '127.0.0.1:3000';
  let pathname = '';
  const method = req.method || 'GET';

  try {
    const parsedUrl = new URL(req.url || '', `http://${host}`);
    pathname = parsedUrl.pathname;
  } catch {
    pathname = (req.url || '').split('?')[0];
  }

  // Only handle internal Auth, Admin, Player, and Favorites routes
  if (
    !pathname.startsWith('/api/auth') &&
    !pathname.startsWith('/api/admin') &&
    !pathname.startsWith('/api/player') &&
    !pathname.startsWith('/api/favorites')
  ) {
    return false;
  }

  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range'
    });
    res.end();
    return true;
  }

  try {

  // ----------------- 1. AUTH: LOGIN -----------------
  if (pathname === '/api/auth/login' && method === 'POST') {
    try {
      const { username, password } = await parseBody(req);
      if (!username || !password) {
        sendJson(res, { error: 'Vui lòng nhập tên đăng nhập và mật khẩu.' }, 400);
        return true;
      }

      const user = getUserByUsername(username.trim());
      if (!user) {
        sendJson(res, { error: 'Tài khoản hoặc mật khẩu không chính xác.' }, 401);
        return true;
      }

      const isMatch = bcrypt.compareSync(password, user.password_hash);
      if (!isMatch) {
        sendJson(res, { error: 'Tài khoản hoặc mật khẩu không chính xác.' }, 401);
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
    } catch (err: any) {
      sendJson(res, { error: err.message || 'Lỗi xác thực đăng nhập' }, 500);
      return true;
    }
  }

  // ----------------- 2. AUTH: CURRENT USER PROFILE -----------------
  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = authenticateRequest(req);
    if (!user) {
      sendJson(res, { error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' }, 401);
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

  // ----------------- 3. ADMIN: GET ALL USERS -----------------
  if (pathname === '/api/admin/users' && method === 'GET') {
    const user = authenticateRequest(req);
    if (!user) {
      sendJson(res, { error: 'Chưa đăng nhập.' }, 401);
      return true;
    }
    if (user.role !== 'admin') {
      sendJson(res, { error: 'Từ chối truy cập: Quyền Admin là bắt buộc.' }, 403);
      return true;
    }

    const users = listUsers();
    sendJson(res, users);
    return true;
  }

  // ----------------- 4. ADMIN: CREATE USER -----------------
  if (pathname === '/api/admin/users' && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) {
      sendJson(res, { error: 'Chưa đăng nhập.' }, 401);
      return true;
    }
    if (user.role !== 'admin') {
      sendJson(res, { error: 'Từ chối truy cập: Chỉ Admin mới có quyền tạo người dùng.' }, 403);
      return true;
    }

    try {
      const { username, password, role } = await parseBody(req);
      if (!username || !password) {
        sendJson(res, { error: 'Tên đăng nhập và mật khẩu không được để trống.' }, 400);
        return true;
      }
      if (password.length < 6) {
        sendJson(res, { error: 'Mật khẩu phải có ít nhất 6 ký tự.' }, 400);
        return true;
      }

      const assignedRole = role === 'admin' ? 'admin' : 'user';
      const existing = getUserByUsername(username.trim());
      if (existing) {
        sendJson(res, { error: 'Tên tài khoản này đã tồn tại.' }, 409);
        return true;
      }

      const created = createUser(username.trim(), password, assignedRole);
      sendJson(res, { user: created }, 201);
      return true;
    } catch (err: any) {
      sendJson(res, { error: err.message || 'Lỗi khi tạo người dùng' }, 500);
      return true;
    }
  }

  // ----------------- 5. ADMIN: DELETE USER -----------------
  if (pathname.startsWith('/api/admin/users/') && method === 'DELETE') {
    const user = authenticateRequest(req);
    if (!user) {
      sendJson(res, { error: 'Chưa đăng nhập.' }, 401);
      return true;
    }
    if (user.role !== 'admin') {
      sendJson(res, { error: 'Từ chối truy cập: Chỉ Admin mới có quyền xóa người dùng.' }, 403);
      return true;
    }

    const idStr = pathname.replace('/api/admin/users/', '').trim();
    const targetId = parseInt(idStr, 10);
    if (!targetId || isNaN(targetId)) {
      sendJson(res, { error: 'ID người dùng không hợp lệ.' }, 400);
      return true;
    }

    if (targetId === user.id) {
      sendJson(res, { error: 'Không thể tự xóa chính tài khoản Admin đang đăng nhập.' }, 400);
      return true;
    }

    const success = deleteUser(targetId);
    if (success) {
      sendJson(res, { success: true, message: 'Đã xóa người dùng thành công.' });
    } else {
      sendJson(res, { error: 'Không tìm thấy người dùng cần xóa.' }, 404);
    }
    return true;
  }

  // ----------------- 6. PLAYBACK STATE: GET -----------------
  if (pathname === '/api/player/state' && method === 'GET') {
    const user = authenticateRequest(req);
    if (!user) {
      sendJson(res, { error: 'Chưa đăng nhập.' }, 401);
      return true;
    }

    const state = getPlaybackState(user.id);
    sendJson(res, state || { lastTrack: null, progressSeconds: 0, queue: [], volume: 0.85 });
    return true;
  }

  // ----------------- 7. PLAYBACK STATE: SAVE / SYNC -----------------
  if (pathname === '/api/player/state' && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) {
      sendJson(res, { error: 'Chưa đăng nhập.' }, 401);
      return true;
    }

    try {
      const { lastTrack, progressSeconds, queue, volume } = await parseBody(req);
      savePlaybackState(
        user.id,
        lastTrack,
        Number(progressSeconds) || 0,
        Array.isArray(queue) ? queue : [],
        volume !== undefined ? Number(volume) : 0.85
      );
      sendJson(res, { success: true });
      return true;
    } catch (err: any) {
      sendJson(res, { error: err.message || 'Lỗi khi lưu tiến trình phát' }, 500);
      return true;
    }
  }

  // ----------------- 8. FAVORITES: GET -----------------
  if (pathname === '/api/favorites' && method === 'GET') {
    const user = authenticateRequest(req);
    if (!user) {
      sendJson(res, { error: 'Chưa đăng nhập.' }, 401);
      return true;
    }

    const tracks = getFavorites(user.id);
    sendJson(res, tracks);
    return true;
  }

  // ----------------- 9. FAVORITES: TOGGLE -----------------
  if (pathname === '/api/favorites/toggle' && method === 'POST') {
    const user = authenticateRequest(req);
    if (!user) {
      sendJson(res, { error: 'Chưa đăng nhập.' }, 401);
      return true;
    }

    try {
      const { track } = await parseBody(req);
      if (!track || !track.id) {
        sendJson(res, { error: 'Thiếu thông tin track' }, 400);
        return true;
      }

      const isLiked = toggleFavorite(user.id, track);
      sendJson(res, { isLiked, trackId: track.id });
      return true;
    } catch (err: any) {
      sendJson(res, { error: err.message || 'Lỗi lưu bài hát yêu thích' }, 500);
      return true;
    }
  }
  } catch (err: any) {
    console.error('[AppRoutes Master Error]', err);
    if (!res.headersSent) {
      sendJson(res, { error: err?.message || 'Internal Server Error' }, 500);
    }
    return true;
  }

  return false;
}
