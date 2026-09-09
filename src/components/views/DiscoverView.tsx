import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Play,
  Heart,
  UserPlus,
  Check,
  Sparkles,
  Disc,
  Flame,
  Radio,
  Clock,
  Music2,
  ChevronRight,
  TrendingUp,
  Headphones
} from 'lucide-react';
import { Track, Artist, PlayHistoryItem } from '../../types';

export interface MoodCategory {
  id: string;
  label: string;
  emoji: string;
  query: string;
}

export const YTM_MOODS: MoodCategory[] = [
  { id: 'relax', label: 'Thư giãn', emoji: '🧘', query: 'Nhạc thư giãn chill acoustic relax' },
  { id: 'energize', label: 'Nạp năng lượng', emoji: '⚡', query: 'Nhạc nạp năng lượng sôi động upbeat' },
  { id: 'focus', label: 'Tập trung', emoji: '🎯', query: 'Nhạc tập trung làm việc học bài focus lofi' },
  { id: 'workout', label: 'Tập thể dục', emoji: '🏃', query: 'Nhạc tập gym thể dục workout edm dance' },
  { id: 'feelgood', label: 'Vui tươi', emoji: '😊', query: 'Nhạc vui vẻ yêu đời feel good positive pop' },
  { id: 'romance', label: 'Lãng mạn', emoji: '💖', query: 'Nhạc lãng mạn tình ca ngọt ngào tình yêu' },
  { id: 'sad', label: 'Buồn & Tâm trạng', emoji: '🌧️', query: 'Nhạc buồn tâm trạng ballad sâu lắng' },
  { id: 'sleep', label: 'Dễ ngủ', emoji: '🌙', query: 'Nhạc dễ ngủ ru ngủ deep sleep lofi ambient' },
  { id: 'party', label: 'Tiệc tùng', emoji: '🎉', query: 'Nhạc quẩy tiệc tùng remix party dance' },
  { id: 'coffee', label: 'Khởi đầu ngày mới', emoji: '☕', query: 'Nhạc buổi sáng cà phê nhẹ nhàng acoustic' },
];

interface DiscoverViewProps {
  tracks: Track[];
  artists: Artist[];
  isLoading: boolean;
  onPlayTrack: (track: Track, queue?: Track[]) => void;
  onToggleLike: (track: Track) => void;
  onTrackArtist: (artist: Artist) => void;
  trackedArtistIds: Set<string>;
  onSelectArtist: (artist: Artist) => void;
  onQuickSearch: (query: string, moodId?: string) => void;
  likedTrackIds?: Set<string>;
  playHistory?: PlayHistoryItem[];
  likedTracks?: Track[];
  currentTrack?: Track | null;
  activeMoodId?: string | null;
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  tracks,
  artists,
  isLoading,
  onPlayTrack,
  onToggleLike,
  onTrackArtist,
  trackedArtistIds,
  onSelectArtist,
  onQuickSearch,
  likedTrackIds,
  playHistory = [],
  likedTracks = [],
  currentTrack,
  activeMoodId
}) => {
  // Pagination: display initial 18 tracks, load more on button click
  const [visibleCount, setVisibleCount] = useState<number>(18);
  const [highlightedMoodIndex, setHighlightedMoodIndex] = useState<number>(() => {
    const idx = YTM_MOODS.findIndex(m => m.id === activeMoodId);
    return idx >= 0 ? idx : 0;
  });
  const moodBarRef = useRef<HTMLDivElement>(null);

  // Synchronize highlighted index when activeMoodId changes
  useEffect(() => {
    if (activeMoodId) {
      const idx = YTM_MOODS.findIndex(m => m.id === activeMoodId);
      if (idx >= 0) setHighlightedMoodIndex(idx);
    }
  }, [activeMoodId]);

  const handleMoodKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setHighlightedMoodIndex((prev) => {
        const next = (prev + 1) % YTM_MOODS.length;
        const targetEl = moodBarRef.current?.children[next] as HTMLElement | undefined;
        targetEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        targetEl?.focus();
        return next;
      });
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setHighlightedMoodIndex((prev) => {
        const next = prev <= 0 ? YTM_MOODS.length - 1 : prev - 1;
        const targetEl = moodBarRef.current?.children[next] as HTMLElement | undefined;
        targetEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        targetEl?.focus();
        return next;
      });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const target = YTM_MOODS[highlightedMoodIndex];
      if (target) {
        onQuickSearch(target.query, target.id);
      }
    }
  };

  // Dynamic Personalized Recommendations extracted from Play History & Favorites
  const { topArtists, recentTrack, hasHistory } = useMemo(() => {
    const artistCounts: Record<string, number> = {};

    // 1. Tally from play history
    playHistory.forEach(item => {
      const art = item.artist?.trim();
      if (art && art !== 'Unknown' && art !== 'YouTube Music Stream') {
        artistCounts[art] = (artistCounts[art] || 0) + (item.completedCount > 0 ? 2 : 1) * (item.playCount || 1);
      }
    });

    // 2. Tally from liked tracks
    likedTracks.forEach(t => {
      const art = t.artist?.trim();
      if (art && art !== 'Unknown') {
        artistCounts[art] = (artistCounts[art] || 0) + 3;
      }
    });

    const sortedArtists = Object.entries(artistCounts)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0])
      .slice(0, 4);

    let latest: Track | null = currentTrack || null;
    if (!latest && playHistory.length > 0) {
      const first = playHistory[0];
      latest = {
        id: first.trackId,
        title: first.title,
        artist: first.artist,
        artistId: first.artistId,
        album: first.album,
        duration: first.duration,
        thumbnail: first.thumbnail,
        isLiked: first.isLiked
      };
    }
    const historyExists = playHistory.length > 0 || likedTracks.length > 0;

    return {
      topArtists: sortedArtists,
      recentTrack: latest,
      hasHistory: historyExists
    };
  }, [playHistory, likedTracks, currentTrack]);

  const displayedTracks = tracks.slice(0, visibleCount);

  return (
    <div className="space-y-8 pb-36">
      {/* 1. YouTube Music Mood & Genre Chips Bar with Arrow Keyboard Navigation */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-300 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Tâm trạng & Thể loại âm nhạc</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full text-zinc-400 font-mono hidden sm:inline-block">
              Phím ← → duyệt • Enter chọn
            </span>
            <span className="text-[11px] text-zinc-500 font-medium">YouTube Music Vibes</span>
          </div>
        </div>

        <div
          ref={moodBarRef}
          tabIndex={0}
          onKeyDown={handleMoodKeyDown}
          role="region"
          aria-label="Thanh gợi ý tâm trạng và thể loại"
          className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-none select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50 rounded-2xl p-1"
        >
          {YTM_MOODS.map((mood, idx) => {
            const isActive = activeMoodId === mood.id;
            const isHighlighted = highlightedMoodIndex === idx;
            return (
              <button
                key={mood.id}
                tabIndex={0}
                onClick={() => {
                  setHighlightedMoodIndex(idx);
                  onQuickSearch(mood.query, mood.id);
                }}
                onFocus={() => setHighlightedMoodIndex(idx)}
                className={`group flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all duration-200 active:scale-95 shadow-sm border focus:outline-none ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 text-white border-transparent shadow-[0_0_15px_rgba(99,102,241,0.5)] scale-105'
                    : isHighlighted
                    ? 'bg-white/15 text-white border-indigo-400/80 ring-2 ring-indigo-400/60 shadow-[0_0_12px_rgba(99,102,241,0.4)] scale-105'
                    : 'bg-white/[0.04] hover:bg-white/10 text-zinc-300 hover:text-white border-white/8 hover:border-white/20'
                }`}
              >
                <span className="text-sm transition-transform group-hover:scale-125">{mood.emoji}</span>
                <span>{mood.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Đề xuất cá nhân hóa dựa trên lịch sử nghe nhạc (Dynamic Recommendations) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
            <Headphones className="w-4 h-4 text-cyan-400" />
            <span>Đề xuất theo gu của bạn</span>
          </div>
          {hasHistory && (
            <span className="text-[11px] text-zinc-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-zinc-500" />
              Dựa trên lịch sử nghe gần đây
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Card 1: Dựa trên bài hát vừa nghe */}
          {recentTrack ? (
            <div
              onClick={() => onQuickSearch(`${recentTrack.artist} ${recentTrack.title} radio`)}
              className="glass-card group rounded-2xl p-4 flex items-center gap-3.5 cursor-pointer hover:border-indigo-500/50 hover:bg-white/10 transition-all duration-200 relative overflow-hidden"
            >
              <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-800 shadow">
                {recentTrack.thumbnail ? (
                  <img
                    src={recentTrack.thumbnail}
                    alt={recentTrack.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                ) : (
                  <Music2 className="w-6 h-6 text-zinc-500 m-auto" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Play className="w-4 h-4 fill-white text-white" />
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-1">
                  <Radio className="w-2.5 h-2.5 text-indigo-400" />
                  <span>Dựa trên bài vừa nghe</span>
                </div>
                <h4 className="text-xs font-bold text-white truncate group-hover:text-indigo-300 transition-colors">
                  {recentTrack.title}
                </h4>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                  {recentTrack.artist}
                </p>
              </div>
            </div>
          ) : (
            <div
              onClick={() => onQuickSearch('V-Pop Mới Nhất 2026')}
              className="glass-card group rounded-2xl p-4 flex items-center gap-3.5 cursor-pointer hover:border-indigo-500/50 hover:bg-white/10 transition-all"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                <Flame className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wide">Xu hướng hôm nay</span>
                <h4 className="text-xs font-bold text-white truncate group-hover:text-cyan-300">V-Pop Thịnh Hành 2026</h4>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">Bắt nhịp bài hát được nghe nhiều nhất</p>
              </div>
            </div>
          )}

          {/* Card 2: Nghệ sĩ nghe nhiều */}
          {topArtists.length > 0 ? (
            <div className="glass-card rounded-2xl p-4 flex flex-col justify-between border border-white/8 hover:border-purple-500/40 transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-300">
                  <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                  <span>Nghệ sĩ nghe nhiều nhất</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {topArtists.map(artistName => (
                  <button
                    key={artistName}
                    onClick={() => onQuickSearch(artistName)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-500/15 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 transition-all active:scale-95 truncate max-w-[140px]"
                    title={`Tìm bài hát của ${artistName}`}
                  >
                    {artistName}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              onClick={() => onQuickSearch('Chill Lofi Acoustic')}
              className="glass-card group rounded-2xl p-4 flex items-center gap-3.5 cursor-pointer hover:border-purple-500/50 hover:bg-white/10 transition-all"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                <Music2 className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wide">Không gian tĩnh lặng</span>
                <h4 className="text-xs font-bold text-white truncate group-hover:text-purple-300">Chill Lofi Acoustic</h4>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">Giai điệu nhẹ nhàng êm dịu</p>
              </div>
            </div>
          )}

          {/* Card 3: Tuyển tập bài yêu thích */}
          <div
            onClick={() => {
              if (likedTracks.length > 0) {
                onPlayTrack(likedTracks[0], likedTracks);
              } else {
                onQuickSearch('Acoustic Hits');
              }
            }}
            className="glass-card group rounded-2xl p-4 flex items-center gap-3.5 cursor-pointer hover:border-rose-500/50 hover:bg-white/10 transition-all duration-200"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-tr from-rose-500 to-pink-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-rose-500/20 group-hover:scale-105 transition-transform">
              <Heart className="w-6 h-6 text-white fill-white" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wide">Yêu thích cá nhân</span>
              <h4 className="text-xs font-bold text-white truncate group-hover:text-rose-300">
                {likedTracks.length > 0 ? `Đã lưu ${likedTracks.length} bài hát` : 'Khám phá bài hát mới'}
              </h4>
              <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                {likedTracks.length > 0 ? 'Bấm để phát danh sách yêu thích' : 'Thả tim để lưu vào bộ sưu tập'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Disc className="w-10 h-10 text-indigo-400 animate-spin" />
          <p className="mt-3 text-xs text-zinc-400 animate-pulse font-medium">
            Đang tải dữ liệu âm thanh chất lượng cao từ YouTube Music...
          </p>
        </div>
      ) : (
        <>
          {/* 3. Artists Showcase (Khi tìm kiếm hoặc có nghệ sĩ liên quan) */}
          {artists.length > 0 && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Nghệ sĩ liên quan</span>
                </h3>
                <span className="text-[11px] text-zinc-400">
                  {artists.length} nghệ sĩ tìm thấy
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                {artists.map((artist) => {
                  const isTracked = trackedArtistIds.has(artist.id);
                  return (
                    <div
                      key={artist.id}
                      className="glass-card rounded-2xl p-4 flex flex-col items-center text-center group cursor-pointer border border-white/8 hover:border-indigo-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10"
                      onClick={() => onSelectArtist(artist)}
                    >
                      <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden mb-3 border-2 border-white/10 group-hover:border-indigo-400/80 transition-all duration-300 shadow-lg">
                        {artist.thumbnail ? (
                          <img
                            src={artist.thumbnail}
                            alt={artist.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs font-bold">
                            {artist.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Music2 className="w-5 h-5 text-white" />
                        </div>
                      </div>

                      <h4 className="text-xs sm:text-sm font-bold text-white truncate w-full group-hover:text-indigo-300 transition-colors">
                        {artist.name}
                      </h4>
                      <p className="text-[10px] text-zinc-400 mt-0.5 truncate w-full font-medium">
                        {artist.subscribers || 'Nghệ sĩ YouTube Music'}
                      </p>

                      <div className="mt-3 flex items-center gap-1.5 w-full">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onTrackArtist(artist);
                          }}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[10px] font-semibold transition-all active:scale-95 ${
                            isTracked
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/30'
                          }`}
                          title={isTracked ? 'Đang theo dõi' : 'Theo dõi nghệ sĩ'}
                        >
                          {isTracked ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Đã theo dõi</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-3 h-3 text-indigo-300" />
                              <span>Theo dõi</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Danh sách Bài hát (Songs Grid với Pagination) */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Music2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  {tracks.length > 0 ? `Danh sách Bài hát (${tracks.length})` : 'Khám phá âm nhạc'}
                </span>
              </h3>
              {tracks.length > 0 && (
                <span className="text-[11px] text-zinc-400">
                  Hiển thị {Math.min(visibleCount, tracks.length)}/{tracks.length} bài
                </span>
              )}
            </div>

            {tracks.length === 0 ? (
              <div className="glass-card rounded-3xl p-12 text-center text-zinc-400 border border-white/8">
                <Music2 className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-sm font-semibold text-white">Chưa có bài hát nào được hiển thị</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Hãy chọn một thẻ tâm trạng ở trên hoặc nhập từ khóa tìm kiếm để khám phá.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {displayedTracks.map((track) => {
                    const isLiked = (likedTrackIds && likedTrackIds.has(track.id)) || !!track.isLiked;

                    return (
                      <div
                        key={track.id}
                        onClick={() => onPlayTrack(track, tracks)}
                        className="glass-card group flex items-center justify-between p-3 rounded-2xl cursor-pointer hover:bg-white/10 border border-white/6 hover:border-white/15 transition-all duration-200"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-800 shadow-md">
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
                            <h4 className="text-xs font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                              {track.title}
                            </h4>
                            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                              {track.artist}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-[10px] text-zinc-500 tabular-nums">
                            {formatDuration(track.duration)}
                          </span>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleLike(track);
                            }}
                            className="p-1.5 text-zinc-400 hover:text-rose-400 active:scale-90 transition-transform"
                            title={isLiked ? 'Bỏ thích' : 'Yêu thích'}
                          >
                            <Heart
                              className={`w-4 h-4 transition-all duration-200 ${
                                isLiked
                                  ? 'fill-rose-500 text-rose-500 scale-110 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                                  : 'hover:text-rose-400'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 5. Nút 'Xem thêm bài hát' (Pagination) */}
                {tracks.length > visibleCount && (
                  <div className="flex justify-center pt-4 pb-2">
                    <button
                      onClick={() => setVisibleCount(prev => prev + 18)}
                      className="px-6 py-3 rounded-2xl text-xs font-bold bg-indigo-600/20 hover:bg-indigo-600/35 text-indigo-300 border border-indigo-500/30 hover:border-indigo-400/60 shadow-lg shadow-indigo-500/10 transition-all active:scale-95 flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <span>Xem thêm bài hát (+{Math.min(18, tracks.length - visibleCount)} bài tiếp theo)</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
