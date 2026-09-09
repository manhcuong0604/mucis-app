import React from 'react';
import {
  Minimize2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Volume2,
  VolumeX,
  Disc3,
  Loader2
} from 'lucide-react';
import { Track, PlayerState } from '../../types';
import { VisualizerCanvas } from '../VisualizerCanvas';
import { WaveformSeekbar } from '../WaveformSeekbar';

interface NowPlayingZenProps {
  playerState: PlayerState;
  onClose: () => void;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onToggleLike: (track: Track) => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const NowPlayingZen: React.FC<NowPlayingZenProps> = ({
  playerState,
  onClose,
  onPlayPause,
  onPrev,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleLike
}) => {
  const { currentTrack, isPlaying, currentTime, duration, volume, isMuted, isLoading } = playerState;
  const [dragTime, setDragTime] = React.useState<number | null>(null);
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  // Mouse Wheel Volume Control for Zen Mode
  const zenRef = React.useRef<HTMLDivElement>(null);
  const latestPropsRef = React.useRef({ volume, isMuted, onVolumeChange, onToggleMute });

  React.useEffect(() => {
    latestPropsRef.current = { volume, isMuted, onVolumeChange, onToggleMute };
  }, [volume, isMuted, onVolumeChange, onToggleMute]);

  React.useEffect(() => {
    const el = zenRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
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
      ref={zenRef}
      className="fixed inset-0 z-50 flex flex-col justify-between p-8 bg-black/85 backdrop-blur-3xl animate-fade-in select-none"
    >
      {/* Top Bar: Close Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Disc3 className="w-5 h-5 text-indigo-400 animate-spin-slow" />
          <span className="text-xs font-bold tracking-widest uppercase text-zinc-400">
            Mucis Zen Immersion
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 transition-colors"
          title="Thu nhỏ chế độ Zen"
        >
          <Minimize2 className="w-5 h-5" />
        </button>
      </div>

      {/* Center: Large Vinyl Record with Glowing Aura */}
      <div className="flex flex-col items-center justify-center my-auto">
        <div className="relative flex items-center justify-center">
          {/* Ambient Glow */}
          <div
            className={`absolute w-96 h-96 rounded-full bg-indigo-500/25 blur-3xl transition-opacity duration-1000 ${
              isPlaying ? 'opacity-100 scale-110' : 'opacity-40 scale-95'
            }`}
          />

          {/* Vinyl Body */}
          <div
            className={`relative w-72 h-72 sm:w-84 sm:h-84 md:w-96 md:h-96 rounded-full bg-[#111218] border-8 border-black/80 shadow-[0_0_80px_rgba(0,0,0,0.9)] flex items-center justify-center transition-all ${
              isPlaying ? 'animate-vinyl' : 'vinyl-paused'
            }`}
          >
            {/* Vinyl Grooves concentric rings */}
            <div className="absolute inset-4 rounded-full border border-white/5" />
            <div className="absolute inset-8 rounded-full border border-white/5" />
            <div className="absolute inset-12 rounded-full border border-white/5" />
            <div className="absolute inset-16 rounded-full border border-white/5" />
            <div className="absolute inset-20 rounded-full border border-white/5" />

            {/* Center Label (Album Art) */}
            <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full overflow-hidden border-4 border-[#1f2029] shadow-inner relative flex items-center justify-center">
              {currentTrack?.thumbnail ? (
                <img
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-indigo-600 to-purple-600" />
              )}
              {/* Spindle hole */}
              <div className="absolute w-6 h-6 rounded-full bg-[#0a0a0f] border-2 border-white/20" />
            </div>
          </div>
        </div>

        {/* Track Title & Artist */}
        <div className="mt-8 text-center max-w-lg px-4">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight truncate">
            {currentTrack?.title || 'Chưa chọn bài hát'}
          </h2>
          {isLoading ? (
            <p className="text-sm sm:text-base font-medium text-cyan-400 mt-1 flex items-center justify-center gap-2 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              Đang chuẩn bị âm thanh...
            </p>
          ) : (
            <p className="text-sm sm:text-base text-zinc-400 mt-1 font-medium truncate">
              {currentTrack?.artist || 'YouTube Music High Fidelity'}
            </p>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex flex-col items-center gap-6 max-w-xl mx-auto w-full">
        {/* Seekbar */}
        <div className="w-full flex items-center gap-3.5">
          <span className="text-xs font-semibold text-zinc-400 tabular-nums w-12 text-right flex-shrink-0">
            {formatTime(dragTime !== null ? dragTime : currentTime)}
          </span>

          <div className="flex-1">
            <WaveformSeekbar
              currentTime={currentTime}
              duration={duration}
              onSeek={onSeek}
              onDragTimeChange={setDragTime}
              barCount={64}
              height={26}
            />
          </div>

          <span className="text-xs font-semibold text-zinc-500 tabular-nums w-12 flex-shrink-0">
            {formatTime(duration)}
          </span>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-6">
          {currentTrack && (
            <button
              onClick={() => onToggleLike(currentTrack)}
              className="p-2 text-zinc-400 hover:text-rose-400 transition-colors active:scale-90"
              title={currentTrack.isLiked ? 'Bỏ thích' : 'Yêu thích'}
            >
              <Heart
                className={`w-6 h-6 transition-all duration-300 ${
                  currentTrack.isLiked
                    ? 'fill-rose-500 text-rose-500 scale-110 drop-shadow-[0_0_12px_rgba(244,63,94,0.8)]'
                    : 'hover:text-rose-400'
                }`}
              />
            </button>
          )}

          <button
            onClick={onPrev}
            disabled={!currentTrack}
            className="p-2 text-zinc-300 hover:text-white active:scale-95 transition-all disabled:opacity-40"
          >
            <SkipBack className="w-6 h-6" />
          </button>

          <button
            onClick={onPlayPause}
            disabled={!currentTrack}
            className="p-4 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-600 to-cyan-400 text-white shadow-xl shadow-indigo-500/40 hover:scale-105 active:scale-95 transition-all"
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-6 h-6 fill-white" />
            ) : (
              <Play className="w-6 h-6 fill-white translate-x-0.5" />
            )}
          </button>

          <button
            onClick={onNext}
            disabled={!currentTrack}
            className="p-2 text-zinc-300 hover:text-white active:scale-95 transition-all disabled:opacity-40"
          >
            <SkipForward className="w-6 h-6" />
          </button>

          {/* Volume */}
          <div className="flex items-center gap-2.5 select-none">
            <button
              onClick={onToggleMute}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
              title={isMuted ? "Bật âm" : `Tắt âm (${Math.round((isMuted ? 0 : volume) * 100)}%)`}
            >
              {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5" />}
            </button>

            <div className="relative flex items-center w-24 h-5 cursor-pointer flex-shrink-0 group/zenvol">
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
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none transition-transform duration-75 group-hover/zenvol:scale-125 z-10"
                style={{ left: `${(isMuted ? 0 : volume) * 100}%` }}
              >
                <div className="w-3.5 h-3.5 rounded-full bg-white border border-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8),_0_0_2px_rgba(255,255,255,0.9)]" />
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
        </div>
      </div>
    </div>
  );
};
