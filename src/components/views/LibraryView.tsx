import React, { useState } from 'react';
import { Heart, Play, Radio, Database, Music2, History, Flame, Clock } from 'lucide-react';
import { Track, PlayHistoryItem } from '../../types';

interface LibraryViewProps {
  likedTracks: Track[];
  playHistory?: PlayHistoryItem[];
  onPlayTrack: (track: Track) => void;
  onPlayAllLiked: () => void;
  onToggleLike: (track: Track) => void;
  onGoToRadar: () => void;
  trackedArtistsCount: number;
}

function formatDuration(sec: number): string {
  if (!sec) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return '';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} ngày trước`;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  likedTracks,
  playHistory = [],
  onPlayTrack,
  onPlayAllLiked,
  onToggleLike,
  onGoToRadar,
  trackedArtistsCount
}) => {
  const [activeTab, setActiveTab] = useState<'liked' | 'history'>('liked');

  return (
    <div className="space-y-6 pb-36 select-none">
      {/* Top Banner Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Liked Card */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-rose-900/40 via-purple-900/20 to-black/60 border border-rose-500/20 backdrop-blur-xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 flex items-center justify-center text-rose-400 mb-4 border border-rose-500/30">
              <Heart className="w-5 h-5 fill-rose-500" />
            </div>
            <h3 className="text-xl font-black text-white">
              Bài Hát Yêu Thích
            </h3>
            <p className="text-xs text-zinc-300 mt-1">
              {likedTracks.length} bài hát đã lưu trong SQLite cục bộ
            </p>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={onPlayAllLiked}
              disabled={likedTracks.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all disabled:opacity-40 active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Phát danh sách yêu thích</span>
            </button>
          </div>
        </div>

        {/* Smart Radar Card */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-900/40 via-cyan-900/20 to-black/60 border border-indigo-500/20 backdrop-blur-xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 border border-cyan-500/30">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <h3 className="text-xl font-black text-white">
              Artist Radar Playlist
            </h3>
            <p className="text-xs text-zinc-300 mt-1">
              Đang giám sát {trackedArtistsCount} nghệ sĩ từ YouTube Music
            </p>
          </div>

          <div className="mt-6">
            <button
              onClick={onGoToRadar}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Mở Radar bài mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setActiveTab('liked')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'liked'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Heart className={`w-3.5 h-3.5 ${activeTab === 'liked' ? 'fill-rose-500' : ''}`} />
          <span>Yêu thích ({likedTracks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'history'
              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <History className="w-3.5 h-3.5 text-indigo-400" />
          <span>Lịch sử nghe trên máy ({playHistory.length})</span>
        </button>
      </div>

      {/* Content for Active Tab */}
      {activeTab === 'liked' ? (
        <div className="space-y-3">
          {likedTracks.length === 0 ? (
            <div className="rounded-3xl p-10 text-center text-zinc-400 bg-white/[0.02] border border-white/5">
              <Music2 className="w-10 h-10 mx-auto mb-2 text-zinc-600" />
              <p className="text-xs">Bạn chưa thích bài hát nào. Hãy bấm biểu tượng trái tim khi nghe nhạc để lưu vào đây.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {likedTracks.map((track) => (
                <div
                  key={track.id}
                  onClick={() => onPlayTrack(track)}
                  className="group flex items-center justify-between p-3 rounded-2xl bg-zinc-900/50 hover:bg-white/10 border border-white/5 hover:border-white/15 cursor-pointer transition-all duration-200"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-800 shadow">
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Play className="w-3.5 h-3.5 fill-white text-white" />
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

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[11px] text-zinc-500 tabular-nums">
                      {formatDuration(track.duration)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleLike(track);
                      }}
                      className="p-1.5 text-rose-500 hover:text-zinc-400 transition-colors"
                      title="Bỏ thích"
                    >
                      <Heart className="w-4 h-4 fill-rose-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* History Tab */
        <div className="space-y-3">
          {playHistory.length === 0 ? (
            <div className="rounded-3xl p-10 text-center text-zinc-400 bg-white/[0.02] border border-white/5">
              <History className="w-10 h-10 mx-auto mb-2 text-zinc-600" />
              <p className="text-xs">Chưa có lịch sử phát nhạc nào trên thiết bị này.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {playHistory.map((item) => {
                const track: Track = {
                  id: item.trackId,
                  title: item.title,
                  artist: item.artist,
                  duration: item.duration,
                  thumbnail: item.thumbnail,
                  isLiked: item.isLiked
                };
                return (
                  <div
                    key={item.trackId}
                    onClick={() => onPlayTrack(track)}
                    className="group flex items-center justify-between p-3 rounded-2xl bg-zinc-900/50 hover:bg-white/10 border border-white/5 hover:border-white/15 cursor-pointer transition-all duration-200"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-800 shadow">
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Play className="w-3.5 h-3.5 fill-white text-white" />
                        </div>
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                          {item.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-400">
                          <span className="truncate">{item.artist}</span>
                          <span className="text-zinc-600">•</span>
                          <span className="text-amber-400 flex items-center gap-0.5 flex-shrink-0">
                            <Flame className="w-3 h-3" />
                            {item.playCount} lần
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-[10px] text-zinc-500 tabular-nums">
                        {formatTimeAgo(item.listenedAt)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLike(track);
                        }}
                        className={`p-1.5 transition-colors ${item.isLiked ? 'text-rose-500' : 'text-zinc-500 hover:text-rose-400'}`}
                        title={item.isLiked ? 'Bỏ thích' : 'Yêu thích'}
                      >
                        <Heart className={`w-4 h-4 ${item.isLiked ? 'fill-rose-500' : ''}`} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
