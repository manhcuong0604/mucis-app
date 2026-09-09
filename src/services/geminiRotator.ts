import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiApiKeys, saveGeminiApiKeys, HistoryTrack, AiRecommendationResult } from './auth';
import { Track, PlayHistoryItem } from '../types';

// Con trỏ theo dõi key đang hoạt động cho cơ chế xoay vòng round-robin
let currentKeyIndex = 0;

/**
 * Lấy danh sách API Keys an toàn từ các nguồn: Custom params -> SQLite/localStorage/Config -> .env
 */
export async function getActiveGeminiKeys(providedKeys?: string[]): Promise<string[]> {
  if (Array.isArray(providedKeys) && providedKeys.length > 0) {
    return Array.from(new Set(providedKeys.map(k => k.trim()).filter(Boolean)));
  }

  // 1. Lấy từ SQLite/localStorage/Backend settings
  const stored = await getGeminiApiKeys();
  if (stored && stored.length > 0) {
    return stored;
  }

  // 2. Fallback sang biến môi trường .env (nếu có)
  const envRaw = 
    (typeof process !== 'undefined' && process.env?.GEMINI_API_KEYS) ||
    (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
    ((import.meta as any).env?.VITE_GEMINI_API_KEYS as string) ||
    ((import.meta as any).env?.VITE_GEMINI_API_KEY as string) ||
    '';

  if (envRaw) {
    const fromEnv = envRaw
      .replace(/\n/g, ',')
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);
    if (fromEnv.length > 0) {
      return Array.from(new Set(fromEnv));
    }
  }

  return [];
}

/**
 * Hàm gọi Gemini có cơ chế tự xoay vòng khi hết quota
 */
export async function callGeminiWithFallback(prompt: string, customKeys?: string[]): Promise<string> {
  const apiKeys = await getActiveGeminiKeys(customKeys);

  if (apiKeys.length === 0) {
    throw new Error('Chưa cấu hình GEMINI_API_KEYS trong file .env hoặc Popup Cài đặt');
  }

  let attempts = 0;
  const totalKeys = apiKeys.length;

  while (attempts < totalKeys) {
    const safeIndex = currentKeyIndex % totalKeys;
    const activeKey = apiKeys[safeIndex];
    console.log(`[Gemini Rotator] Đang dùng Key số ${safeIndex + 1}/${totalKeys}`);

    try {
      const genAI = new GoogleGenerativeAI(activeKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      // Bắt các mã lỗi vượt hạn mức (429, RESOURCE_EXHAUSTED hoặc quota exceeded)
      const isQuotaError =
        error?.status === 429 ||
        error?.message?.includes('429') ||
        error?.message?.includes('RESOURCE_EXHAUSTED') ||
        error?.message?.includes('Quota exceeded') ||
        error?.message?.includes('quota') ||
        error?.message?.includes('rate limit');

      if (isQuotaError) {
        console.warn(`[Gemini Rotator] Key ${safeIndex + 1} hết hạn ngạch/bị rate limit. Chuyển sang key kế tiếp...`);
        // Chuyển sang key tiếp theo trong danh sách
        currentKeyIndex = (safeIndex + 1) % totalKeys;
        attempts++;
      } else {
        // Lỗi khác (ví dụ prompt sai cú pháp, mạng ngắt kết nối...) thì ném lỗi ra ngoài
        throw error;
      }
    }
  }

  throw new Error('Tất cả API Keys dự phòng đều đã hết hạn mức (Quota Exceeded). Vui lòng thử lại sau.');
}

/**
 * Phân tích User Music DNA và đề xuất 5 bài hát bằng geminiRotator
 */
export async function analyzeMusicDnaWithRotator(
  historyTracks: HistoryTrack[] = [],
  guestArtists: string[] = [],
  guestGenres: string[] = [],
  customKeys?: string[]
): Promise<AiRecommendationResult> {
  let promptContext = '';
  if (guestArtists.length > 0 || guestGenres.length > 0) {
    promptContext = `
Người dùng đang ở chế độ Trải nghiệm nhanh (Guest Mode) và đã chọn gu âm nhạc:
- Nghệ sĩ yêu thích: ${guestArtists.join(', ') || 'Indie / V-Pop đương đại'}
- Thể loại yêu thích: ${guestGenres.join(', ') || 'V-Pop, Indie Acoustic, R&B'}
`;
  } else {
    const list = historyTracks.slice(0, 30).map((t, idx) => `${idx + 1}. "${t.title}" - ${t.artist} (${t.album || ''})`);
    promptContext = `
Dưới đây là 30 bài hát gần nhất trong lịch sử nghe nhạc của người dùng từ YouTube Music:
${list.join('\n') || 'V-Pop Hits 2026'}
`;
  }

  const prompt = `
Bạn là chuyên gia thẩm định âm nhạc AI của ứng dụng Mucis.
${promptContext}

Nhiệm vụ của bạn:
1. Phân tích "User Music DNA":
   - Thể loại chủ đạo (genres: mảng 3-4 thể loại)
   - Tâm trạng / Mood (mood: ví dụ "Hoài niệm, Thư giãn, Tràn đầy năng lượng")
   - Vibe / Gu thẩm mỹ (vibe: mô tả ngắn 1-2 câu về gu nghe nhạc của người này)
2. Đề xuất chính xác 5 bài hát MỚI cực kỳ phù hợp với gu âm nhạc này.
   Mỗi bài gồm: title, artist, reason (lý do đề xuất vì sao hợp gu).

YÊU CẦU: CHỈ TRẢ VỀ DUY NHẤT MỘT ĐỐI TƯỢNG JSON HỢP LỆ THEO SCHEMA SAU, KHÔNG KÈM TEXT NÀO KHÁC:
{
  "musicDna": {
    "genres": ["V-Pop", "Indie", "R&B"],
    "mood": "...",
    "vibe": "..."
  },
  "recommendations": [
    {
      "title": "Tên bài hát",
      "artist": "Tên nghệ sĩ",
      "reason": "Lý do gợi ý"
    }
  ]
}
`;

  const rawJson = await callGeminiWithFallback(prompt, customKeys);
  const cleanJson = rawJson.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleanJson);

  return {
    musicDna: parsed.musicDna || {
      genres: guestGenres.length ? guestGenres : ['V-Pop', 'Indie'],
      mood: 'Thư thái & Cảm xúc',
      vibe: 'Giai điệu mộc mạc kết hợp nhịp điệu hiện đại',
    },
    recommendations: (parsed.recommendations || []).map((r: any, idx: number) => ({
      id: r.id || `ai-track-${idx}-${Date.now()}`,
      title: r.title,
      artist: r.artist,
      reason: r.reason || 'Phù hợp hoàn hảo với sở thích âm nhạc của bạn',
      thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60',
      duration: 210,
    })),
    activeKeyIndex: (currentKeyIndex % (await getActiveGeminiKeys(customKeys)).length) + 1,
    totalKeys: (await getActiveGeminiKeys(customKeys)).length,
  };
}

export interface LocalAiMixResult {
  playlistTitle: string;
  mood: string;
  genres: string[];
  vibe: string;
  tracks: Track[];
  rawRecommendations: Array<{ title: string; artist: string; reason: string }>;
  activeKeyIndex: number;
  totalKeys: number;
}

/**
 * Trích xuất 20 bài nghe nhiều/thích nhất từ SQLite local, gửi vào geminiRotator
 * để phân tích gu và tự động resolve video YouTube Music tạo playlist gợi ý mới
 */
export async function generateLocalRecommendationsFromHistory(
  topTracks: PlayHistoryItem[],
  customKeys?: string[]
): Promise<LocalAiMixResult> {
  const keys = await getActiveGeminiKeys(customKeys);
  if (!keys.length) {
    throw new Error('Chưa cấu hình Gemini API Key. Vui lòng nhấn nút "Gemini Keys" trên thanh tiêu đề để thêm key.');
  }

  let promptContext = '';
  if (topTracks.length > 0) {
    const lines = topTracks.slice(0, 25).map((t, idx) => {
      const likedStr = t.isLiked ? ' (Đã thích ❤️)' : '';
      const playsStr = t.playCount > 1 ? ` - Nghe ${t.playCount} lần` : '';
      return `${idx + 1}. "${t.title}" - ${t.artist}${likedStr}${playsStr}`;
    });
    promptContext = `
Dưới đây là danh sách ${lines.length} bài hát được nghe nhiều nhất và yêu thích nhất trên thiết bị (Local Play History):
${lines.join('\n')}
`;
  } else {
    promptContext = `
Người dùng mới cài đặt ứng dụng và chưa có lịch sử nghe nhạc. 
Hãy chọn lọc một tuyển tập âm nhạc khởi đầu thật đặc sắc (gồm các bản hit V-Pop, Indie Acoustic, Lofi Chillout, R&B đương đại).
`;
  }

  const prompt = `
Bạn là AI Music Director của ứng dụng nghe nhạc Mucis.
${promptContext}

Hãy thực hiện nhiệm vụ:
1. Phân tích Gu âm nhạc (Music DNA) của người dùng:
   - Mood (tâm trạng chủ đạo, ví dụ: "Deep Chill & Lofi", "Tràn đầy năng lượng", "Acoustic hoài niệm")
   - Genres (mảng 3-4 thể loại âm nhạc tương ứng)
   - Vibe (1-2 câu nhận xét nghệ thuật về gu nghe nhạc của người dùng)
   - PlaylistTitle (đặt tên một playlist thật thơ và ấn tượng cho danh sách này, ví dụ: "Giai Điệu Chiều Hoàng Hôn", "Midnight Coffee & Soul", "V-Indie Reverie")
2. Đề xuất đúng 8 bài hát MỚI (chưa có trong danh sách trên) nhưng có cùng vibe và phong cách âm nhạc để người dùng khám phá.

YÊU CẦU: CHỈ TRẢ VỀ DUY NHẤT MỘT ĐỐI TƯỢNG JSON HỢP LỆ VỚI CẤU TRÚC SAU:
{
  "playlistTitle": "...",
  "mood": "...",
  "genres": ["...", "..."],
  "vibe": "...",
  "recommendations": [
    {
      "title": "Tên bài hát",
      "artist": "Tên nghệ sĩ",
      "reason": "Lý do bài này hợp gu"
    }
  ]
}
`;

  const rawJson = await callGeminiWithFallback(prompt, customKeys);
  const cleanJson = rawJson.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleanJson);
  } catch (err) {
    console.error('Failed to parse Gemini JSON:', rawJson);
    throw new Error('Không thể đọc kết quả phân tích từ Gemini AI');
  }

  const recommendations = parsed.recommendations || [];
  const foundTracks: Track[] = [];

  // Resolve direct tracks via anonymous YouTube Music search
  const { searchTracks } = await import('./youtube');
  for (const item of recommendations.slice(0, 8)) {
    try {
      const searchRes = await searchTracks(`${item.title} ${item.artist}`);
      if (searchRes.length > 0) {
        const best = searchRes[0];
        foundTracks.push({
          ...best,
          title: item.title || best.title,
          artist: item.artist || best.artist,
        });
      } else {
        foundTracks.push({
          id: `ai-${Math.random().toString(36).substring(2, 9)}`,
          title: item.title,
          artist: item.artist,
          duration: 210,
          thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60'
        });
      }
    } catch {
      foundTracks.push({
        id: `ai-${Math.random().toString(36).substring(2, 9)}`,
        title: item.title,
        artist: item.artist,
        duration: 210,
        thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60'
      });
    }
  }

  const activeKeys = await getActiveGeminiKeys(customKeys);
  return {
    playlistTitle: parsed.playlistTitle || 'AI For You Discovery',
    mood: parsed.mood || 'Thư thái & Cảm xúc',
    genres: parsed.genres || ['V-Pop', 'Indie', 'Acoustic'],
    vibe: parsed.vibe || 'Giai điệu tuyển chọn dựa trên lịch sử nghe cục bộ của bạn.',
    tracks: foundTracks,
    rawRecommendations: recommendations,
    activeKeyIndex: (currentKeyIndex % activeKeys.length) + 1,
    totalKeys: activeKeys.length
  };
}

export { getGeminiApiKeys, saveGeminiApiKeys };