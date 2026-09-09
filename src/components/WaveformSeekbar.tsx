import React, { useState, useRef, useMemo } from 'react';

interface WaveformSeekbarProps {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  onDragTimeChange?: (seconds: number | null) => void;
  barCount?: number;
  height?: number;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const WaveformSeekbar: React.FC<WaveformSeekbarProps> = ({
  currentTime,
  duration,
  onSeek,
  onDragTimeChange,
  barCount = 48,
  height = 22
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);

  // Generate an aesthetic harmonic pseudo-waveform profile
  const waveformProfile = useMemo(() => {
    const bars: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const normalizedX = i / barCount;
      const base = 0.28;
      const wave1 = Math.sin(normalizedX * Math.PI * 3.5) * 0.32;
      const wave2 = Math.cos(normalizedX * Math.PI * 7.2) * 0.20;
      const wave3 = Math.sin(normalizedX * Math.PI * 14.8) * 0.12;
      const randomJitter = (Math.sin(i * 997) * 0.5 + 0.5) * 0.16;
      const amplitude = Math.max(0.2, Math.min(1.0, base + Math.abs(wave1 + wave2 + wave3) + randomJitter));
      bars.push(amplitude);
    }
    return bars;
  }, [barCount]);

  // Current displayed progress (prioritizing active drag time)
  const activeSeconds = dragTime !== null ? dragTime : currentTime;
  const progressPercent = duration > 0 ? Math.max(0, Math.min(1, activeSeconds / duration)) : 0;
  const hoverPercent = duration > 0 && hoverTime !== null ? Math.max(0, Math.min(1, hoverTime / duration)) : null;

  const calculatePosition = (clientX: number) => {
    if (!containerRef.current || duration <= 0) {
      return { targetSeconds: 0, percent: 0, clickX: 0 };
    }
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = rect.width > 0 ? clickX / rect.width : 0;
    const targetSeconds = percent * duration;
    return { targetSeconds, percent, clickX };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    setIsDragging(true);
    const { targetSeconds, clickX } = calculatePosition(e.clientX);
    setDragTime(targetSeconds);
    setHoverTime(targetSeconds);
    setHoverX(clickX);
    onDragTimeChange?.(targetSeconds);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const pos = calculatePosition(moveEvent.clientX);
      setDragTime(pos.targetSeconds);
      setHoverTime(pos.targetSeconds);
      setHoverX(pos.clickX);
      onDragTimeChange?.(pos.targetSeconds);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      const pos = calculatePosition(upEvent.clientX);
      setIsDragging(false);
      setDragTime(null);
      onDragTimeChange?.(null);
      onSeek(pos.targetSeconds);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) return; // Handled by window pointermove
    const result = calculatePosition(e.clientX);
    setHoverTime(result.targetSeconds);
    setHoverX(result.clickX);
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setHoverTime(null);
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative flex items-center w-full cursor-pointer py-2.5 group select-none touch-none"
      style={{ height: `${height + 16}px` }}
    >
      {/* Background horizontal track line */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-white/10 rounded-full overflow-hidden pointer-events-none">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.6)]"
          style={{ width: `${progressPercent * 100}%` }}
        />
      </div>

      {/* Floating Hover / Drag Time Indicator */}
      {(hoverTime !== null || isDragging) && (
        <div
          className="absolute -top-7 px-2 py-0.5 text-[10px] font-bold rounded-md bg-zinc-950/90 text-white border border-white/20 shadow-xl pointer-events-none transform -translate-x-1/2 z-30 transition-opacity duration-75"
          style={{ left: `${hoverX}px` }}
        >
          {formatTime(hoverTime ?? activeSeconds)}
        </div>
      )}

      {/* Array of waveform vertical bars */}
      <div className="relative flex items-center justify-between gap-[2px] w-full h-full pointer-events-none">
        {waveformProfile.map((amplitude, i) => {
          const barProgress = i / barCount;
          const isPlayed = barProgress <= progressPercent;
          const isHovered = hoverPercent !== null && barProgress <= hoverPercent;
          const barPixelHeight = Math.max(4, Math.round(amplitude * height));

          return (
            <div
              key={i}
              className="flex-1 flex items-center justify-center h-full"
            >
              <div
                className={`w-full max-w-[4px] rounded-full transition-all duration-100 ${
                  isPlayed
                    ? 'bg-gradient-to-t from-indigo-500 via-purple-400 to-cyan-400 shadow-[0_0_8px_rgba(99,102,241,0.5)] opacity-95'
                    : isHovered
                    ? 'bg-white/40'
                    : 'bg-white/15 group-hover:bg-white/25'
                }`}
                style={{
                  height: `${barPixelHeight}px`,
                  transform: isPlayed && barProgress > progressPercent - 0.04 ? 'scaleY(1.15)' : 'scaleY(1)',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Synchronized Glowing Circular Thumb (Nút tròn đồng bộ chuẩn xác) */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none z-20 flex items-center justify-center transition-transform duration-75 ${
          isDragging ? 'scale-125' : 'group-hover:scale-110'
        }`}
        style={{ left: `${progressPercent * 100}%` }}
      >
        <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.9),_0_0_4px_rgba(255,255,255,0.9)]" />
      </div>
    </div>
  );
};
