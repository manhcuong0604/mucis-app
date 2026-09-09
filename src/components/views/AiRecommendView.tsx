import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Play, 
  Music, 
  Flame, 
  Clock, 
  History, 
  RefreshCw, 
  Heart,
  Radio,
  KeyRound,
  Headphones
} from 'lucide-react';
import { Track, PlayHistoryItem } from '../../types';
import { getTopInteractedTracks } from '../../services/db';
import { generateLocalRecommendationsFromHistory, LocalAiMixResult } from '../../services/geminiRotator';

interface AiRecommendViewProps {
  onPlayTrack: (track: Track, queue?: Track[]) => void;
  onOpenGeminiKeys?: () => void;
  onShowToast: (msg: string, type?: 'info' | 'error' | 'success') => void;
  onToggleLike?: (track: Track) => void;
  likedTrackIds?: Set<string>;
}

export const AiRecommendView: React.FC<AiRecommendViewProps> = ({
  onPlayTrack,
  onOpenGeminiKeys,
  onShowToast,
  onToggleLike,
  likedTrackIds
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [topTracks, setTopTracks] = useState<PlayHistoryItem[]>([]);
  const [aiResult, setAiResult] = useState<LocalAiMixResult | null>(null);

  // Load local play history on mount
  useEffect(() => {
    loadLocalHistory();
  }, []);

  const loadLocalHistory = async () => {
    try {
      const history = await getTopInteractedTracks(30);
      setTopTracks(history);
    } catch (err) {
      console.warn('Failed to load local history:', err);
    }
  };

  const handleGenerateRecommendations = async () => {
    setIsAnalyzing(true);
    try {
      // Re-fetch latest local history
      const currentHistory = await getTopInteractedTracks(30);
      setTopTracks(currentHistory);

      onShowToast('Đang phân tích gu âm nhạc qua Gemini AI...', 'info');
      const result = await generateLocalRecommendationsFromHistory(currentHistory);
      setAiResult(result);
      onShowToast(`Đã tạo thành công playlist: "${result.playlistTitle}"`, 'success');
    } catch (err: any) {
      console.error('AI Recommendation failed:', err);
      const errMsg = err?.message || 'Không thể tạo gợi ý lúc này. Vui lòng kiểm tra lại API Key.';
      onShowToast(errMsg, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePlayAllAiTracks = () => {
    if (!aiResult || !aiResult.tracks.length) return;
    onPlayTrack(aiResult.tracks[0], aiResult.tracks);
    onShowToast(`Bắt đầu phát danh sách: "${aiResult.playlistTitle}"`, 'success');
  };

  return (
    <div className="space-y-8 animate-fade-in pb-36 select-none max-w-5xl mx-auto">
      {/* Hero Header */}
      <div className="relative rounded-3xl p-8 overflow-hidden bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-zinc-950 border border-white/10 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-60 h-60 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold tracking-wide">
              <Sparkles className="w-3.5 h-3.5 animate-spin-slow" />
              <span>Local-First AI Taste Profiler</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              AI Vibe & Smart Playlist
            </h1>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Trích xuất gu âm nhạc trực tiếp từ lịch sử nghe trên máy của bạn (SQLite Local), 
              kết hợp Gemini Multi-Key để tạo nên danh sách phát độc bản mang đậm dấu ấn riêng.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 flex-shrink-0">
            <button
              onClick={handleGenerateRecommendations}
              disabled={isAnalyzing}
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-600 to-cyan-400 text-white font-semibold text-sm shadow-[0_0_30px_rgba(99,102,241,0.5)] hover:shadow-[0_0_40px_rgba(99,102,241,0.7)] active:scale-95 transition-all duration-200 flex items-center justify-center gap-2.5 disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>{isAnalyzing ? 'Đang phân tích...' : '✨ Đề xuất nhạc mới'}</span>
            </button>

            {onOpenGeminiKeys && (
              <button
                onClick={onOpenGeminiKeys}
                title="Cấu hình Gemini API Keys"
                className="w-full sm:w-auto px-4 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <KeyRound className="w-4 h-4 text-purple-400" />
                <span>Gemini Keys</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Local Taste Footprint (Top Interacted Tracks from SQLite) */}
      <div className="rounded-2xl p-6 bg-zinc-900/40 border border-white/8 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">
              Dấu ấn âm nhạc từ máy của bạn ({topTracks.length} bài)
            </h3>
          </div>
          <button
            onClick={loadLocalHistory}
            className="text-xs text-zinc-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Làm mới</span>
          </button>
        </div>

        {topTracks.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <Headphones className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-400">
              Chưa có bài hát nào được ghi nhận trong lịch sử nghe cục bộ.
            </p>
            <p className="text-[11px] text-zinc-500">
              Hãy bấm nghe một số bài hát hoặc bấm "Đề xuất nhạc mới" ở trên để AI tạo ngay playlist khám phá khởi đầu!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {topTracks.slice(0, 6).map((item, idx) => (
              <div
                key={item.trackId || idx}
                onClick={() => onPlayTrack({
                  id: item.trackId,
                  title: item.title,
                  artist: item.artist,
                  duration: item.duration,
                  thumbnail: item.thumbnail,
                  isLiked: item.isLiked
                })}
                className="group flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 cursor-pointer transition-all active:scale-[0.98]"
              >
                <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0">
                  <img
                    src={item.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100'}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Play className="w-4 h-4 fill-white text-white" />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-semibold text-zinc-200 truncate group-hover:text-indigo-300 transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {item.artist}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Flame className="w-3 h-3 text-amber-400" />
                      {item.playCount} lần
                    </span>
                    {item.isLiked && (
                      <span className="flex items-center gap-0.5 text-rose-400">
                        <Heart className="w-2.5 h-2.5 fill-rose-500" />
                        Đã thích
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Recommendation Result */}
      {aiResult && (
        <div className="space-y-6 animate-fade-in">
          {/* DNA & Vibe Card */}
          <div className="rounded-3xl p-6 bg-gradient-to-br from-indigo-950/60 via-purple-950/40 to-black border border-indigo-500/20 backdrop-blur-2xl shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                  AI Music DNA
                </span>
                <h2 className="text-2xl font-black text-white mt-0.5">
                  {aiResult.playlistTitle}
                </h2>
              </div>

              <button
                onClick={handlePlayAllAiTracks}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/30 transition-all active:scale-95 flex-shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Phát toàn bộ danh sách ({aiResult.tracks.length} bài)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-white/10">
              <div className="p-3 rounded-2xl bg-white/5">
                <span className="text-[10px] uppercase font-semibold text-zinc-400">Tâm trạng chủ đạo</span>
                <p className="text-sm font-bold text-cyan-300 mt-0.5">{aiResult.mood}</p>
              </div>
              <div className="p-3 rounded-2xl bg-white/5">
                <span className="text-[10px] uppercase font-semibold text-zinc-400">Thể loại tương hợp</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {aiResult.genres.map((g, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[10px] font-medium">
                      {g}
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-white/5">
                <span className="text-[10px] uppercase font-semibold text-zinc-400">Đánh giá Vibe</span>
                <p className="text-xs text-zinc-300 mt-0.5 leading-snug">{aiResult.vibe}</p>
              </div>
            </div>
          </div>

          {/* Recommended Tracks List */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Danh sách bài hát đề xuất ({aiResult.tracks.length} bài)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {aiResult.tracks.map((track, idx) => {
                const reason = aiResult.rawRecommendations[idx]?.reason;
                return (
                  <div
                    key={track.id}
                    onClick={() => onPlayTrack(track, aiResult.tracks)}
                    className="group flex items-center justify-between p-3.5 rounded-2xl bg-zinc-900/60 hover:bg-white/10 border border-white/8 hover:border-indigo-500/30 transition-all duration-200 cursor-pointer shadow-md"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-md flex-shrink-0">
                        <img
                          src={track.thumbnail}
                          alt={track.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Play className="w-4 h-4 fill-white text-white" />
                        </div>
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-zinc-100 truncate group-hover:text-indigo-300 transition-colors">
                          {track.title}
                        </h4>
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                          {track.artist}
                        </p>
                        {reason && (
                          <p className="text-[10px] text-indigo-300/80 truncate mt-0.5 font-medium">
                            💡 {reason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {onToggleLike && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLike(track);
                          }}
                          className="p-2 text-zinc-400 hover:text-rose-400 active:scale-90 transition-transform"
                          title={((likedTrackIds && likedTrackIds.has(track.id)) || track.isLiked) ? 'Bỏ thích' : 'Yêu thích'}
                        >
                          <Heart
                            className={`w-4 h-4 transition-all duration-200 ${
                              ((likedTrackIds && likedTrackIds.has(track.id)) || track.isLiked)
                                ? 'fill-rose-500 text-rose-500 scale-110 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                                : 'hover:text-rose-400'
                            }`}
                          />
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlayTrack(track, aiResult.tracks);
                        }}
                        className="p-2.5 rounded-xl bg-white/5 group-hover:bg-indigo-500 group-hover:text-white text-zinc-400 transition-all"
                        title="Phát bài hát"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
