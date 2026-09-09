import { saveAppSetting, getAppSetting } from './db';

const BACKEND_URL = 'http://127.0.0.1:47823';

export interface AuthStatus {
  authenticated: boolean;
  account?: any;
  accountName?: string;
  error?: string;
}

export interface DeviceCodeResponse {
  userCode: string;
  deviceCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

export interface PollTokenResponse {
  status: 'pending' | 'success' | 'error';
  message?: string;
  token?: any;
}

export interface HistoryTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  thumbnail?: string;
  playedDate?: string;
}

export interface MusicDNA {
  genres: string[];
  mood: string;
  vibe: string;
}

export interface AiRecommendation {
  id: string;
  title: string;
  artist: string;
  thumbnail?: string;
  duration?: number;
  reason: string;
}

export interface AiRecommendationResult {
  musicDna: MusicDNA;
  recommendations: AiRecommendation[];
  note?: string;
  activeKeyIndex?: number;
  totalKeys?: number;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/status`);
    if (!res.ok) {
      const dbConnected = (await getAppSetting('ytmusic_connected')) === 'true';
      const localConnected = localStorage.getItem('aura_ytmusic_connected') === 'true';
      const isConn = dbConnected || localConnected;
      const accName = (await getAppSetting('ytmusic_account')) || localStorage.getItem('aura_ytmusic_account') || '';
      return { authenticated: isConn, accountName: accName };
    }
    const data = await res.json();
    if (data.authenticated) {
      const dbAcc = await getAppSetting('ytmusic_account');
      const accName = data.accountName || dbAcc || localStorage.getItem('aura_ytmusic_account') || 'YouTube Music User';
      localStorage.setItem('aura_ytmusic_connected', 'true');
      localStorage.setItem('aura_ytmusic_account', accName);
      await saveAppSetting('ytmusic_connected', 'true');
      await saveAppSetting('ytmusic_account', accName);
      return { ...data, accountName: accName };
    }
    return data;
  } catch (err) {
    const dbConnected = (await getAppSetting('ytmusic_connected')) === 'true';
    const localConnected = localStorage.getItem('aura_ytmusic_connected') === 'true';
    const isConn = dbConnected || localConnected;
    const accName = (await getAppSetting('ytmusic_account')) || localStorage.getItem('aura_ytmusic_account') || '';
    return { authenticated: isConn, accountName: accName, error: String(err) };
  }
}

export async function saveCookieAuth(cookie: string, accountName: string = ''): Promise<{ success: boolean; accountName?: string }> {
  const savedName = accountName || 'YouTube Music User';

  // 1. Save to SQLite local database
  await saveAppSetting('ytmusic_cookie', cookie);
  await saveAppSetting('ytmusic_connected', 'true');
  await saveAppSetting('ytmusic_account', savedName);

  // 2. Save to localStorage
  localStorage.setItem('aura_ytmusic_cookie', cookie);
  localStorage.setItem('aura_ytmusic_connected', 'true');
  localStorage.setItem('aura_ytmusic_account', savedName);

  // 3. Post to backend to initialize ytmusicapi session
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/save_cookie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie, accountName: savedName }),
    });
    const data = await res.json().catch(() => ({ success: res.ok }));
    const finalName = data.accountName || savedName;
    localStorage.setItem('aura_ytmusic_account', finalName);
    await saveAppSetting('ytmusic_account', finalName);
    return { success: data.success ?? res.ok, accountName: finalName };
  } catch {
    return { success: true, accountName: savedName };
  }
}

export async function logoutYtMusic(): Promise<boolean> {
  try {
    localStorage.removeItem('aura_ytmusic_connected');
    localStorage.removeItem('aura_ytmusic_account');
    localStorage.removeItem('aura_ytmusic_cookie');

    await saveAppSetting('ytmusic_connected', 'false');
    await saveAppSetting('ytmusic_cookie', '');
    await saveAppSetting('ytmusic_account', '');

    const res = await fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return res.ok;
  } catch {
    return true;
  }
}

export async function getUserHistory(limit = 30): Promise<HistoryTrack[]> {
  const res = await fetch(`${BACKEND_URL}/api/user/history?limit=${limit}`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Chưa thể tải lịch sử YouTube Music' }));
    throw new Error(errData.error || 'Lỗi tải lịch sử');
  }
  return await res.json();
}

export async function getGeminiApiKeys(): Promise<string[]> {
  // 1. Try Backend Settings
  try {
    const res = await fetch(`${BACKEND_URL}/api/settings/gemini_keys`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.keys) && data.keys.length > 0) {
        localStorage.setItem('aura_gemini_keys', JSON.stringify(data.keys));
        await saveAppSetting('gemini_api_keys', JSON.stringify(data.keys));
        return data.keys;
      }
    }
  } catch {}

  // 2. Try SQLite DB
  try {
    const dbVal = await getAppSetting('gemini_api_keys');
    if (dbVal) {
      const parsed = JSON.parse(dbVal);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  // 3. Fallback to localStorage
  try {
    const raw = localStorage.getItem('aura_gemini_keys');
    if (raw) return JSON.parse(raw);
  } catch {}

  return [];
}

export async function saveGeminiApiKeys(keys: string[] | string): Promise<boolean> {
  let keyList: string[] = [];
  if (Array.isArray(keys)) {
    keyList = keys.map(k => k.trim()).filter(Boolean);
  } else if (typeof keys === 'string') {
    keyList = keys.replace(/\n/g, ',').split(',').map(k => k.trim()).filter(Boolean);
  }

  // Deduplicate keys
  keyList = Array.from(new Set(keyList));

  // 1. Save to SQLite
  await saveAppSetting('gemini_api_keys', JSON.stringify(keyList));

  // 2. Save to localStorage
  localStorage.setItem('aura_gemini_keys', JSON.stringify(keyList));

  // 3. Save to backend config
  try {
    const res = await fetch(`${BACKEND_URL}/api/settings/gemini_keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geminiApiKeys: keyList }),
    });
    return res.ok;
  } catch {
    return true;
  }
}

export async function getAiRecommendations(
  geminiApiKeys?: string[] | string,
  historyTracks?: HistoryTrack[],
  guestArtists?: string[],
  guestGenres?: string[]
): Promise<AiRecommendationResult> {
  const keysToSend = Array.isArray(geminiApiKeys)
    ? geminiApiKeys
    : typeof geminiApiKeys === 'string' && geminiApiKeys.trim()
    ? geminiApiKeys.split(',').map(k => k.trim()).filter(Boolean)
    : await getGeminiApiKeys();

  // 1. Ưu tiên gọi client-side service geminiRotator với cơ chế Multi-Key Retry/Rotate
  if (keysToSend.length > 0) {
    try {
      const { analyzeMusicDnaWithRotator } = await import('./geminiRotator');
      const rotatorResult = await analyzeMusicDnaWithRotator(
        historyTracks || [],
        guestArtists || [],
        guestGenres || [],
        keysToSend
      );
      if (rotatorResult && rotatorResult.recommendations?.length > 0) {
        return rotatorResult;
      }
    } catch (rotatorErr: any) {
      console.warn('[AI Recommend] Client geminiRotator error, falling back to backend rotation:', rotatorErr);
      const errMsg = String(rotatorErr?.message || '');
      if (errMsg.includes('Tất cả API Keys dự phòng đều đã hết hạn mức')) {
        throw rotatorErr;
      }
    }
  }

  // 2. Dự phòng: Gửi request tới Backend Python (cũng tích hợp Multi-Key Rotation loop)
  const res = await fetch(`${BACKEND_URL}/api/ai/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      geminiApiKeys: keysToSend,
      historyTracks: historyTracks || [],
      guestArtists: guestArtists || [],
      guestGenres: guestGenres || [],
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Không thể phân tích AI Music DNA' }));
    throw new Error(errData.error || 'Lỗi gợi ý AI');
  }

  return await res.json();
}
