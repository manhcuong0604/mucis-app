import React from 'react';

interface AmbientBackgroundProps {
  gradient: string;
}

export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({ gradient }) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
      {/* Base Ultra-Dark Foundation */}
      <div className="absolute inset-0 bg-[#07080c]" />

      {/* Dynamic Color Canvas Layer with Smooth 1.2s Transition */}
      <div
        className="absolute -inset-10 transition-all duration-1000 ease-out opacity-90 filter blur-2xl"
        style={{ background: gradient }}
      />

      {/* Organic Animated Floating Aurora Glow Orbs */}
      <div
        className="absolute top-1/4 left-1/5 w-[38rem] h-[38rem] rounded-full blur-3xl opacity-35 animate-pulse-glow"
        style={{
          background: 'radial-gradient(circle, rgba(var(--color-primary), 0.7) 0%, transparent 70%)',
          animationDuration: '6s'
        }}
      />
      <div
        className="absolute bottom-1/4 right-1/6 w-[42rem] h-[42rem] rounded-full blur-3xl opacity-30 animate-pulse-glow"
        style={{
          background: 'radial-gradient(circle, rgba(var(--color-secondary), 0.65) 0%, transparent 70%)',
          animationDelay: '2.5s',
          animationDuration: '8s'
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[32rem] h-[32rem] rounded-full blur-3xl opacity-20 animate-pulse-glow"
        style={{
          background: 'radial-gradient(circle, rgba(var(--color-accent), 0.5) 0%, transparent 70%)',
          animationDelay: '4s',
          animationDuration: '7s'
        }}
      />

      {/* Fine Vignette for High-Contrast Cinematic Depth */}
      <div className="absolute inset-0 bg-radial-vignette opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#07080c] via-transparent to-[#07080c]/60" />
    </div>
  );
};
