import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../services/audioEngine';

interface VisualizerCanvasProps {
  isPlaying: boolean;
  barCount?: number;
  height?: number;
  className?: string;
}

export const VisualizerCanvas: React.FC<VisualizerCanvasProps> = ({
  isPlaying,
  barCount = 32,
  height = 36,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const width = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, width, h);

      const freqData = audioEngine.getFrequencyData();
      const step = Math.floor(freqData.length / barCount);
      const barWidth = Math.max(2, (width / barCount) - 2);

      for (let i = 0; i < barCount; i++) {
        let value = isPlaying ? freqData[i * step] || 0 : 4;
        // subtle idle breathing if paused
        if (!isPlaying) {
          value = 6 + Math.sin(Date.now() * 0.003 + i * 0.3) * 4;
        }

        const barHeight = Math.max(3, (value / 255) * (h - 4));
        const x = i * (barWidth + 2);
        const y = h - barHeight;

        // Gradient bar
        const grad = ctx.createLinearGradient(0, y, 0, h);
        grad.addColorStop(0, 'rgba(99, 102, 241, 0.9)');
        grad.addColorStop(0.5, 'rgba(168, 85, 247, 0.8)');
        grad.addColorStop(1, 'rgba(6, 182, 212, 0.6)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
        ctx.fill();
      }

      animationFrameId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying, barCount]);

  return (
    <canvas
      ref={canvasRef}
      width={barCount * 5}
      height={height}
      className={`opacity-90 ${className}`}
    />
  );
};
