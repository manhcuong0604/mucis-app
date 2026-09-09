import { Track } from '../types';

export class AudioEngine {
  private audio: HTMLAudioElement;
  private frequencyData: Uint8Array = new Uint8Array(64);
  private lastFreqUpdate = 0;

  public onTimeUpdate?: (currentTime: number) => void;
  public onDurationChange?: (duration: number) => void;
  public onEnded?: () => void;
  public onError?: (error: any) => void;
  public onPlayStateChange?: (isPlaying: boolean) => void;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = 0.85;

    this.setupListeners();
  }

  private setupListeners() {
    this.audio.addEventListener('timeupdate', () => {
      this.onTimeUpdate?.(this.audio.currentTime);
    });

    this.audio.addEventListener('durationchange', () => {
      if (Number.isFinite(this.audio.duration)) {
        this.onDurationChange?.(this.audio.duration);
      }
    });

    this.audio.addEventListener('ended', () => {
      this.onEnded?.();
    });

    this.audio.addEventListener('play', () => {
      this.onPlayStateChange?.(true);
    });

    this.audio.addEventListener('pause', () => {
      this.onPlayStateChange?.(false);
    });

    this.audio.addEventListener('error', (e) => {
      console.error('Audio playback error:', e, this.audio.error);
      this.onError?.(this.audio.error);
    });
  }

  public async play(streamUrl: string): Promise<void> {
    if (this.audio.src !== streamUrl) {
      this.audio.src = streamUrl;
      this.audio.load();
    }

    try {
      await this.audio.play();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Playback play request failed:', err);
        throw err;
      }
    }
  }

  public pause(): void {
    this.audio.pause();
  }

  public async resume(): Promise<void> {
    try {
      await this.audio.play();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        throw err;
      }
    }
  }

  public seek(seconds: number): void {
    if (Number.isFinite(seconds) && seconds >= 0) {
      this.audio.currentTime = seconds;
    }
  }

  public setVolume(val: number): void {
    const clamped = Math.max(0, Math.min(1, val));
    this.audio.volume = clamped;
  }

  public setMuted(muted: boolean): void {
    this.audio.muted = muted;
  }

  public getFrequencyData(): Uint8Array {
    const isPlaying = !this.audio.paused && this.audio.currentTime > 0;
    if (!isPlaying) {
      this.frequencyData.fill(0);
      return this.frequencyData;
    }

    // Dynamic rhythm synthesizer for visual spectrum animation
    const now = performance.now() / 1000;
    for (let i = 0; i < this.frequencyData.length; i++) {
      const freq = (i + 1) * 2.2;
      const wave = Math.sin(now * 8 + freq) * 0.4 + Math.cos(now * 4 + i * 0.8) * 0.6;
      const val = Math.max(10, Math.min(255, Math.floor((wave + 1) * 110 * this.audio.volume)));
      this.frequencyData[i] = val;
    }
    return this.frequencyData;
  }

  public getCurrentTime(): number {
    return this.audio.currentTime;
  }

  public getDuration(): number {
    return this.audio.duration || 0;
  }
}

export const audioEngine = new AudioEngine();
