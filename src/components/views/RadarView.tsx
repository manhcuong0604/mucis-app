import React from 'react';
import { Radio, Play, Sparkles, RefreshCw, Music2, Clock, Heart } from 'lucide-react';
import { Track } from '../../types';

interface RadarViewProps {
  radarTracks: Track[];
  onPlayTrack: (track: Track) => void;
  onPlayAll: () => void;
  isSyncing: boolean;
  onTriggerSync: () => void;
  syncStatusMsg: string;
  onGoToArtists: () => void;
  onToggleLike?: (track: Track) => void;
  likedTrackIds?: Set<string>;
}

function formatDuration(sec: number): string {
  if (!sec) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const RadarView: React.FC<RadarViewProps> = ({
  radarTracks,
  onPlayTrack,
  onPlayAll,
  isSyncing,
  onTriggerSync,
  syncStatusMsg,
  onGoToArtists,
  onToggleLike,
  likedTrackIds
}) => {
  return (
    <div className="space-y-6 pb-36">
      {/* Hero Banner for Radar */}
      <div className="relative overflow-hidden rounded-3xl p-8 bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-black/60 border border-white/10 backdrop-blur-xl shadow-2xl">
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 mb-4">
            <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
            <span>Autonomous Release Radar</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Radar Phát Hiện Bài Mới
          </h1>
          <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
            Hệ thống tự động theo dõi danh sách nghệ sĩ yêu thích từ YouTube Music, phát hiện các đĩa đơn & ca khúc vừa phát hành và tự động đẩy vào danh sách phát này.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={onPlayAll}
              disabled={radarTracks.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold bg-gradient-to-r from-indigo-500 via-purple-600 to-cyan-400 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-105 active:scale-95 transition-all disabled:opacity-40"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Phát tất cả ({radarTracks.length} bài)</span>
            </button>

            <button
              onClick={onTriggerSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/15 text-zinc-200 border border-white/10 active:scale-95 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{isSyncing ? 'Đang quét...' : 'Quét đĩa mới ngay'}</span>
            </button>
          </div>

          {syncStatusMsg && (
            <p className="mt-3 text-xs text-cyan-300/90 font-medium animate-fade-in flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              {syncStatusMsg}
            </p>
          )}
        </div>

        {/* Subtle decorative background graphic */}
        <div className="absolute right-6 -bottom-8 w-64 h-64 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-600/10 blur-2xl pointer-events-none" />
      </div>

      {/* Tracks List or Empty State */}
      {radarTracks.length === 0 ? (
        <div className="glass-card rounded-3xl p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 flex items-center justify-center mb-4 text-indigo-400">
            <Radio className="w-8 h-8 animate-pulse" />
          </div>
          <h3 className="text-base font-bold text-white">
            Chưa có bài hát mới trong Radar
          </h3>
          <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
            Hãy thêm các nghệ sĩ bạn yêu thích tại mục "Nghệ sĩ". Radar sẽ định kỳ quét YouTube Music và tự động lưu các bài mới phát hành vào đây!
          </p>
          <button
            onClick={onGoToArtists}
            className="mt-6 px-5 py-2 rounded-full text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/30"
          >
            Quản lý danh sách Nghệ sĩ
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-4 text-xs font-semibold text-zinc-400">
            <span>Danh sách phát hành mới ({radarTracks.length})</span>
            <span>Thời lượng</span>
          </div>

          <div className="grid gap-2">
            {radarTracks.map((track, idx) => (
              <div
                key={track.id || idx}
                onClick={() => onPlayTrack(track)}
                className="glass-card group flex items-center justify-between p-3 rounded-2xl cursor-pointer hover:bg-white/10 transition-all duration-200"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-800">
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Play className="w-4 h-4 fill-white text-white" />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                        {track.title}
                      </h4>
                      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex-shrink-0">
                        MỚI
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {track.artist}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-zinc-400 text-xs flex-shrink-0">
                  <span className="text-[11px] tabular-nums text-zinc-500">
                    {formatDuration(track.duration)}
                  </span>

                  {onToggleLike && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleLike(track);
                      }}
                      className="p-1.5 text-zinc-400 hover:text-rose-400 active:scale-90 transition-transform"
                      title={((likedTrackIds && likedTrackIds.has(track.id)) || track.isLiked) ? 'Bỏ thích' : 'Thêm vào yêu thích'}
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
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
