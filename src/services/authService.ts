import { User, SavedPlaybackState, Track } from '../types';

const TOKEN_KEY = 'aura_auth_token';

function getApiUrl(endpoint: string): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return `http://127.0.0.1:47823${endpoint}`;
  }
  return endpoint;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function removeStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

function getAuthHeaders(): Record<string, string> {
  const token = getStoredToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

// ----------------- AUTH APIS -----------------

export async function loginApi(username: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch(getApiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Đăng nhập thất bại');
  }

  setStoredToken(data.token);
  return data;
}

export async function getMeApi(): Promise<User | null> {
  const token = getStoredToken();
  if (!token) return null;

  try {
    const res = await fetch(getApiUrl('/api/auth/me'), {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      removeStoredToken();
      return null;
    }
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

export function logout(): void {
  removeStoredToken();
}

// ----------------- ADMIN APIS -----------------

export async function getAdminUsers(): Promise<User[]> {
  const res = await fetch(getApiUrl('/api/admin/users'), {
    headers: getAuthHeaders()
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tải danh sách người dùng');
  }
  return data;
}

export async function createAdminUser(username: string, password: string, role: 'admin' | 'user'): Promise<User> {
  const res = await fetch(getApiUrl('/api/admin/users'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ username, password, role })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tạo người dùng mới');
  }
  return data.user;
}

export async function deleteAdminUser(id: number): Promise<void> {
  const res = await fetch(getApiUrl(`/api/admin/users/${id}`), {
    method: 'DELETE',
    headers: getAuthHeaders()
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể xóa người dùng');
  }
}

// ----------------- RESUME PLAYBACK APIS -----------------

function stripStreamUrl(track: Track | null): Track | null {
  if (!track) return null;
  const { streamUrl, ...rest } = track;
  return rest as Track;
}

export async function syncPlaybackStateApi(
  lastTrack: Track | null,
  progressSeconds: number,
  queue: Track[],
  volume: number
): Promise<void> {
  const token = getStoredToken();
  if (!token) return;

  try {
    await fetch(getApiUrl('/api/player/state'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        lastTrack: stripStreamUrl(lastTrack),
        progressSeconds,
        queue: queue.map(t => stripStreamUrl(t)),
        volume
      })
    });
  } catch (err) {
    console.debug('[Playback Sync] Notice:', err);
  }
}

export async function getPlaybackStateApi(): Promise<SavedPlaybackState | null> {
  const token = getStoredToken();
  if (!token) return null;

  try {
    const res = await fetch(getApiUrl('/api/player/state'), {
      headers: getAuthHeaders()
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data) {
      data.lastTrack = stripStreamUrl(data.lastTrack);
      data.queue = (data.queue || []).map((t: Track) => stripStreamUrl(t));
    }
    return data;
  } catch {
    return null;
  }
}

// ----------------- FAVORITES APIS -----------------

export async function getFavoritesApi(): Promise<Track[]> {
  const token = getStoredToken();
  if (!token) return [];

  try {
    const res = await fetch(getApiUrl('/api/favorites'), {
      headers: getAuthHeaders()
    });
    if (!res.ok) return [];
    const rawList: Track[] = await res.json();
    return rawList.map(t => stripStreamUrl(t) as Track);
  } catch {
    return [];
  }
}

export async function toggleFavoriteApi(track: Track): Promise<boolean> {
  const token = getStoredToken();
  if (!token) return false;

  const res = await fetch(getApiUrl('/api/favorites/toggle'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ track: stripStreamUrl(track) })
  });

  const data = await res.json();
  return !!data.isLiked;
}
