import { Track, Artist } from '../types';

/**
 * Return internal API URL.
 * When running in Electron with file: protocol, targets local microservice on 127.0.0.1:47823.
 * When running in web/Vite dev server, uses relative path /api/... forwarded by Vite proxy.
 * Absolutely NO third-party URLs (Invidious, Piped, Google) are called directly from client.
 */
function getApiUrl(endpoint: string): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return `http://127.0.0.1:47823${endpoint}`;
  }
  return endpoint;
}

export async function searchTracks(query: string): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const res = await fetch(getApiUrl(`/api/search?q=${encodeURIComponent(q)}&filter=songs`));
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((item: any) => ({
          id: item.id || item.videoId,
          title: item.title,
          artist: item.artist,
          artistId: item.artistId,
          album: item.album,
          duration: item.duration || 0,
          thumbnail: item.thumbnail
        }));
      }
    }
  } catch (err) {
    console.warn('[YouTube Service] Internal backend search error:', err);
  }

  return [];
}

export async function getSearchSuggestions(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const res = await fetch(getApiUrl(`/api/search/suggestions?q=${encodeURIComponent(q)}`));
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.slice(0, 8);
      }
    }
  } catch (err) {
    console.warn('[YouTube Service] Suggestions error:', err);
  }

  return [];
}

export async function searchArtists(query: string): Promise<Artist[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const res = await fetch(getApiUrl(`/api/search?q=${encodeURIComponent(q)}&filter=artists`));
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((item: any) => ({
          id: item.id || item.browseId,
          name: item.name || item.artist,
          thumbnail: item.thumbnail,
          subscribers: item.subscribers
        }));
      }
    }
  } catch (err) {
    console.warn('[YouTube Service] Search artists error:', err);
  }

  return [];
}

export async function lookupArtist(query: string): Promise<Artist | null> {
  const q = query.trim();
  if (!q) return null;

  try {
    const res = await fetch(getApiUrl(`/api/artist/lookup?q=${encodeURIComponent(q)}`));
    if (res.ok) {
      const data = await res.json();
      if (data && data.id) {
        return {
          id: data.id,
          name: data.name,
          thumbnail: data.thumbnail,
          subscribers: data.subscribers
        };
      }
    }
  } catch (err) {
    console.warn('[YouTube Service] Lookup artist error:', err);
  }

  // Fallback: search artists via backend
  const results = await searchArtists(query);
  return results.length > 0 ? results[0] : null;
}

export async function getArtistProfile(artistId: string): Promise<{
  artist: Artist;
  topSongs: Track[];
  singles: any[];
  albums: any[];
} | null> {
  if (!artistId) return null;

  try {
    const res = await fetch(getApiUrl(`/api/artist?id=${encodeURIComponent(artistId)}`));
    if (res.ok) {
      const data = await res.json();
      if (data && data.id) {
        return {
          artist: {
            id: data.id,
            name: data.name,
            thumbnail: data.thumbnail,
            description: data.description,
            subscribers: data.subscribers
          },
          topSongs: (data.topSongs || []).map((t: any) => ({
            id: t.id || t.videoId,
            title: t.title,
            artist: t.artist || data.name,
            artistId: t.artistId || data.id,
            album: t.album,
            duration: t.duration || 0,
            thumbnail: t.thumbnail || data.thumbnail
          })),
          singles: data.singles || [],
          albums: data.albums || []
        };
      }
    }
  } catch (err) {
    console.warn('[YouTube Service] Artist profile error:', err);
  }

  return null;
}

export async function getArtistReleases(artistId: string): Promise<Track[]> {
  if (!artistId) return [];

  try {
    const res = await fetch(getApiUrl(`/api/artist/releases?id=${encodeURIComponent(artistId)}`));
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((item: any) => ({
          id: item.videoId || item.id,
          title: item.title,
          artist: item.artist,
          artistId: item.artistId || artistId,
          album: item.album,
          duration: item.duration || 0,
          thumbnail: item.thumbnail,
          isNewRelease: true
        }));
      }
    }
  } catch (err) {
    console.warn('[YouTube Service] Artist releases error:', err);
  }

  // Fallback: top songs from profile
  const profile = await getArtistProfile(artistId);
  return profile ? profile.topSongs.slice(0, 8).map(t => ({ ...t, isNewRelease: true })) : [];
}

// ----------------- IN-MEMORY STREAM CACHE -----------------
interface MemoryStreamCacheItem {
  streamUrl: string;
  duration?: number;
  expiresAt: number;
}

const memoryStreamCache = new Map<string, MemoryStreamCacheItem>();
const activePrefetches = new Set<string>();

/**
 * Prefetch stream URL cho bài hát tiếp theo trong nền
 */
export async function prefetchTrackStream(videoId: string): Promise<void> {
  if (!videoId) return;

  // 1. Kiểm tra cache RAM ngắn hạn
  const memCached = memoryStreamCache.get(videoId);
  if (memCached && memCached.expiresAt > Date.now()) {
    return;
  }

  // 2. Tránh trigger đồng thời 2 lần cho cùng 1 track
  if (activePrefetches.has(videoId)) {
    return;
  }

  activePrefetches.add(videoId);
  try {
    await resolveStreamUrl(videoId);
  } catch (err) {
    console.debug(`[Prefetch Engine] Không thể prefetch bài ${videoId}:`, err);
  } finally {
    activePrefetches.delete(videoId);
  }
}

/**
 * Giải mã Audio Stream URL qua Backend nội bộ theo thời gian thực (On-the-fly Resolution)
 * Tuyệt đối không tái sử dụng URL lưu trong SQLite lâu ngày để tránh lỗi 403 Forbidden.
 * Hỗ trợ forceRefresh khi audio báo lỗi phát.
 */
export async function resolveStreamUrl(videoId: string, forceRefresh = false): Promise<{ streamUrl: string; duration?: number }> {
  const now = Date.now();

  if (forceRefresh) {
    memoryStreamCache.delete(videoId);
  } else {
    // In-memory RAM Cache ngắn hạn (15 phút) hỗ trợ tua/seek nhanh mà không sợ token hết hạn
    const memCached = memoryStreamCache.get(videoId);
    if (memCached && memCached.expiresAt > now) {
      return { streamUrl: memCached.streamUrl, duration: memCached.duration };
    }
  }

  // Luôn lấy stream URL mới nhất theo thời gian thực từ Backend
  try {
    const refreshParam = forceRefresh ? '&refresh=1' : '';
    const res = await fetch(getApiUrl(`/api/stream?id=${encodeURIComponent(videoId)}${refreshParam}`));
    if (res.ok) {
      const data = await res.json();
      if (data.streamUrl) {
        let finalUrl = data.streamUrl;
        if (data.proxyUrl) {
          const isFile = typeof window !== 'undefined' && window.location.protocol === 'file:';
          finalUrl = isFile ? data.proxyUrl : getApiUrl(`/api/stream_proxy?id=${encodeURIComponent(videoId)}`);
        }
        // Cache tạm trong RAM 15 phút (900s)
        const ttlSeconds = 900;
        memoryStreamCache.set(videoId, {
          streamUrl: finalUrl,
          duration: data.duration,
          expiresAt: now + ttlSeconds * 1000,
        });

        return { streamUrl: finalUrl, duration: data.duration };
      }
    }
  } catch (err) {
    console.warn('[YouTube Service] Stream resolve error via backend:', err);
  }

  throw new Error(`Không thể nạp luồng âm thanh cho bài hát ${videoId} từ backend.`);
}
