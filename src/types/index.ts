export interface Track {
  id: string; // YouTube Video ID
  title: string;
  artist: string;
  artistId?: string;
  album?: string;
  duration: number; // in seconds
  thumbnail: string;
  streamUrl?: string;
  isLiked?: boolean;
  isNewRelease?: boolean;
  publishedAt?: string;
  uploadedAt?: number;
}

export interface Artist {
  id: string; // YouTube Channel/Browse ID
  name: string;
  thumbnail: string;
  subscribers?: string;
  description?: string;
  lastSyncedAt?: number;
  trackedAt?: number;
  totalTracks?: number;
  latestTracks?: Track[];
}

export interface Playlist {
  id: string;
  title: string;
  isSmart?: boolean; // 1 for Smart Radar, 0 for standard
  coverUrl?: string;
  trackCount?: number;
  tracks?: Track[];
  createdAt: number;
}

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  backgroundGradient: string;
}

export type ViewMode = 'radar' | 'discover' | 'artists' | 'library' | 'now-playing' | 'ai-recommend' | 'admin-users';

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
  createdAt?: string;
}

export interface SavedPlaybackState {
  lastTrack: Track | null;
  progressSeconds: number;
  queue: Track[];
  volume: number;
  updatedAt?: string;
}

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading?: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  isRepeat: 'off' | 'all' | 'one';
  queue: Track[];
  queueIndex: number;
}

export interface PlayHistoryItem {
  trackId: string;
  title: string;
  artist: string;
  artistId?: string;
  album?: string;
  duration: number;
  thumbnail: string;
  listenedAt: number;
  playCount: number;
  completedCount: number;
  skipCount: number;
  isLiked: boolean;
}
