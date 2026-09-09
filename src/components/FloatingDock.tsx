import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Maximize2,
  Disc3,
  Music2,
  Loader2
} from 'lucide-react';
import { Track, PlayerState } from '../types';
import { WaveformSeekbar } from './WaveformSeekbar';

interface FloatingDockProps {
  playerState: PlayerState;
  playerError?: string | null;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onToggleLike: (track: Track) => void;
  onOpenZen: () => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const FloatingDock: React.FC<FloatingDockProps> = ({
  playerState,
  playerError,
  onPlayPause,
  onPrev,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onToggleRepeat,
  onToggleLike,
  onOpenZen
}) => {
  const { currentTrack, isPlaying, currentTime, duration, volume, isMuted, isShuffle, isRepeat, isLoading } = playerState;
  const [dragTime, setDragTime] = useState<number | null>(null);

  // Wheel Volume Control: Cuộn chuột lên/xuống tăng/giảm 5%
  const dockRef = useRef<HTMLDivElement>(null);
  const latestPropsRef = useRef({ volume, isMuted, onVolumeChange, onToggleMute });

  useEffect(() => {
    latestPropsRef.current = { volume, isMuted, onVolumeChange, onToggleMute };
  }, [volume, isMuted, onVolumeChange, onToggleMute]);

  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // Ngăn chặn cuộn trang web
      e.preventDefault();
      const { volume: currentVol, isMuted: muted, onVolumeChange: setVol, onToggleMute: toggleMute } = latestPropsRef.current;
      const baseVol = muted ? 0 : currentVol;
      const step = 0.05;
      let targetVol = baseVol;

      if (e.deltaY < 0) {
        // Cuộn lên: Tăng âm lượng 5% (tối đa 100%)
        targetVol = Math.min(1, Math.round((baseVol + step) * 100) / 100);
      } else if (e.deltaY > 0) {
        // Cuộn xuống: Giảm âm lượng 5% (tối thiểu 0%)
        targetVol = Math.max(0, Math.round((baseVol - step) * 100) / 100);
      }

      if (muted && targetVol > 0) {
        toggleMute();
      }
      setVol(targetVol);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return (
    <div
      ref={dockRef}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-4xl select-none"
    >
      {/* Central Glass Capsule */}
      <div className="relative rounded-3xl p-4 bg-black/60 backdrop-blur-3xl border border-white/12 shadow-[0_20px_50px_rgba(0,0,0,0.8),_0_0_30px_rgba(var(--color-primary),0.2)] flex flex-col gap-3 transition-all duration-300">
        {/* TOP ROW: Track Info + Waveform Seekbar + Utilities */}
        <div className="flex items-center justify-between gap-4">
          {/* Left: Track Info & Mini Cover */}
          <div className="flex items-center gap-3 w-60 min-w-0">
            <div
              onClick={onOpenZen}
              className="relative group cursor-pointer w-12 h-12 rounded-xl overflow-hidden shadow-lg border border-white/15 flex-shrink-0"
            >
              {currentTrack?.thumbnail ? (
                <img
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ${
                    isPlaying ? 'brightness-105' : 'brightness-90'
                  }`}
                />
              ) : (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                  <Music2 className="w-5 h-5 text-zinc-500" />
                </div>
              )}
              {/* Spinner overlay on cover art during loading */}
              {isLoading && (
                <div className="absolute inset-0 bg-black/65 backdrop-blur-xs flex items-center justify-center z-10 animate-fade-in">
                  <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Maximize2 className="w-3.5 h-3.5 text-white" />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <h4
                onClick={onOpenZen}
                className="text-xs font-bold text-white truncate cursor-pointer hover:text-indigo-300 transition-colors"
                title={currentTrack?.title || 'Chưa phát bài hát'}
              >
                {currentTrack?.title || 'Chọn bài hát để phát'}
              </h4>
              {isLoading ? (
                <p className="text-[11px] text-cyan-400 font-medium truncate mt-0.5 flex items-center gap-1.5 animate-pulse">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                  Đang nạp luồng âm thanh...
                </p>
              ) : playerError ? (
                <p className="text-[10px] text-rose-400 font-semibold truncate mt-0.5 animate-pulse">
                  {playerError}
                </p>
              ) : (
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                  {currentTrack?.artist || 'YouTube Music Stream'}
                </p>
              )}
            </div>

            {currentTrack && (
              <button
                onClick={() => onToggleLike(currentTrack)}
                className="p-1.5 text-zinc-400 hover:text-rose-400 active:scale-90 transition-transform flex-shrink-0"
                title={currentTrack.isLiked ? 'Bỏ thích' : 'Yêu thích'}
              >
                <Heart
                  className={`w-4 h-4 transition-all duration-300 ${
                    currentTrack.isLiked
                      ? 'fill-rose-500 text-rose-500 scale-110 drop-shadow-[0_0_10px_rgba(244,63,94,0.8)]'
                      : 'hover:text-rose-400'
                  }`}
                />
              </button>
            )}
          </div>

          {/* Center: Audio Waveform Seekbar */}
          <div className="flex-1 flex items-center gap-3 max-w-lg">
            <span className="text-[11px] font-semibold text-zinc-300 tabular-nums w-10 text-right flex-shrink-0">
              {formatTime(dragTime !== null ? dragTime : currentTime)}
            </span>

            <div className="flex-1 flex items-center">
              <WaveformSeekbar
                currentTime={currentTime}
                duration={duration}
                onSeek={onSeek}
                onDragTimeChange={setDragTime}
                barCount={52}
                height={20}
              />
            </div>

            <span className="text-[11px] font-semibold text-zinc-400 tabular-nums w-10 flex-shrink-0">
              {formatTime(duration)}
            </span>
          </div>

          {/* Right: Quick Actions & Volume */}
          <div className="flex items-center gap-2.5 justify-end flex-shrink-0">
            {/* Inline Horizontal Volume Bar with Rich Gradient Fill */}
            <div className="flex items-center gap-2 flex-shrink-0 group/vol">
              <button
                onClick={onToggleMute}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
                title={isMuted ? "Bật âm" : `Tắt âm (${Math.round(volume * 100)}%)`}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              <div className="relative flex items-center w-24 h-5 cursor-pointer flex-shrink-0 select-none">
                {/* Track background */}
                <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden shadow-inner">
                  {/* Active Fill Track */}
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 rounded-full shadow-[0_0_8px_rgba(129,140,248,0.6)] transition-all duration-75"
                    style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                  />
                </div>

                {/* Visible Circular Thumb Knob */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none transition-transform duration-75 group-hover/vol:scale-125 z-10"
                  style={{ left: `${(isMuted ? 0 : volume) * 100}%` }}
                >
                  <div className="w-3 h-3 rounded-full bg-white border border-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8),_0_0_2px_rgba(255,255,255,0.9)]" />
                </div>

                {/* Native Range Slider on top */}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => onVolumeChange(Number(e.target.value))}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20"
                  title={`Âm lượng: ${Math.round((isMuted ? 0 : volume) * 100)}% (Lăn chuột để tăng/giảm 5%)`}
                />
              </div>
            </div>

            {/* Zen Mode Button */}
            <button
              onClick={onOpenZen}
              className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors flex-shrink-0"
              title="Toàn màn hình Zen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* BOTTOM ROW: Symmetrical Center Playback Controller Pill */}
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center gap-4 px-6 py-1.5 rounded-full bg-white/5 border border-white/8 backdrop-blur-md shadow-inner">
            <button
              onClick={onToggleShuffle}
              className={`p-1.5 rounded-full transition-colors ${
                isShuffle ? 'text-indigo-400 bg-indigo-500/20' : 'text-zinc-400 hover:text-white'
              }`}
              title="Phát ngẫu nhiên"
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onPrev}
              disabled={!currentTrack}
              className="p-2 text-zinc-300 hover:text-white active:scale-90 transition-all disabled:opacity-40"
              title="Bài trước"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            {/* Hero Play/Pause Button with Glowing Radial Halo */}
            <button
              onClick={onPlayPause}
              disabled={!currentTrack}
              className="relative group p-3.5 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-600 to-cyan-400 text-white shadow-[0_0_20px_rgba(99,102,241,0.6)] hover:shadow-[0_0_28px_rgba(99,102,241,0.8)] active:scale-95 transition-all duration-200 disabled:opacity-40"
              title={isPlaying ? 'Tạm dừng' : 'Phát'}
            >
              <div className="absolute inset-0 rounded-full bg-white opacity-0 group-hover:opacity-25 transition-opacity" />
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4 fill-white" />
              ) : (
                <Play className="w-4 h-4 fill-white translate-x-0.5" />
              )}
            </button>

            <button
              onClick={onNext}
              disabled={!currentTrack}
              className="p-2 text-zinc-300 hover:text-white active:scale-90 transition-all disabled:opacity-40"
              title="Bài tiếp theo"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <button
              onClick={onToggleRepeat}
              className={`p-1.5 rounded-full transition-colors ${
                isRepeat !== 'off' ? 'text-indigo-400 bg-indigo-500/20' : 'text-zinc-400 hover:text-white'
              }`}
              title={isRepeat === 'one' ? 'Lặp lại 1 bài' : isRepeat === 'all' ? 'Lặp lại danh sách' : 'Không lặp lại'}
            >
              {isRepeat === 'one' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
