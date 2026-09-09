import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, X, Play, Bell } from 'lucide-react';
import { Track, Artist, ViewMode, PlayerState, PlayHistoryItem, User } from './types';
import { Header } from './components/Header';
import { NavigationPill } from './components/NavigationPill';
import { FloatingDock } from './components/FloatingDock';
import { AmbientBackground } from './components/AmbientBackground';
import { RadarView } from './components/views/RadarView';
import { DiscoverView } from './components/views/DiscoverView';
import { ArtistsView } from './components/views/ArtistsView';
import { LibraryView } from './components/views/LibraryView';
import { NowPlayingZen } from './components/views/NowPlayingZen';
import { AiRecommendView } from './components/views/AiRecommendView';
import { LoginView } from './components/views/LoginView';
import { AdminUsersView } from './components/views/AdminUsersView';
import { LinkYouTubeModal } from './components/modals/LinkYouTubeModal';
import { audioEngine } from './services/audioEngine';
import { extractPaletteFromImage } from './services/palette';
import {
  initDatabase,
  getTrackedArtists,
  trackArtist,
  untrackArtist,
  getRadarTracks,
  getPlayHistory,
  recordTrackPlay,
  recordTrackCompleted,
  recordTrackSkipped
} from './services/db';
import {
  getMeApi,
  logout,
  syncPlaybackStateApi,
  getPlaybackStateApi,
  getFavoritesApi,
  toggleFavoriteApi
} from './services/authService';
import { searchTracks, searchArtists, resolveStreamUrl, prefetchTrackStream, getArtistProfile } from './services/youtube';
import { runArtistRadarSync } from './services/radarSync';

export const App: React.FC = () => {
  // Auth & RBAC State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);

  // Navigation & UI State
  const [currentView, setCurrentView] = useState<ViewMode>('radar');
  const [isZenMode, setIsZenMode] = useState(false);
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [activeMoodId, setActiveMoodId] = useState<string | null>(null);
  const [ambientGradient, setAmbientGradient] = useState<string>(
    'radial-gradient(circle at 20% 20%, rgba(99, 102, 241, 0.22) 0%, transparent 60%), radial-gradient(circle at 80% 80%, rgba(168, 85, 247, 0.18) 0%, transparent 60%)'
  );

  // Toast & Error Handling
  const [toast, setToast] = useState<{ id: number; message: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [newReleaseBanner, setNewReleaseBanner] = useState<Track | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const retriedTrackIdsRef = useRef<Set<string>>(new Set());
  const MAX_CONSECUTIVE_ERRORS = 3;

  // Listen for newly discovered releases to celebrate
  useEffect(() => {
    const handleNewReleases = (e: any) => {
      const fresh = e.detail as Track[];
      if (fresh && fresh.length > 0) {
        setNewReleaseBanner(fresh[0]);
        getRadarTracks().then(setRadarTracks);
      }
    };
    window.addEventListener('aura:new-releases', handleNewReleases);
    return () => window.removeEventListener('aura:new-releases', handleNewReleases);
  }, []);

  // Data State
  const [discoverTracks, setDiscoverTracks] = useState<Track[]>([]);
  const [discoverArtists, setDiscoverArtists] = useState<Artist[]>([]);
  const [trackedArtists, setTrackedArtists] = useState<Artist[]>([]);
  const [radarTracks, setRadarTracks] = useState<Track[]>([]);
  const [likedTracks, setLikedTracks] = useState<Track[]>([]);
  const [playHistory, setPlayHistory] = useState<PlayHistoryItem[]>([]);

  // Radar Sync State
  const [isSyncingRadar, setIsSyncingRadar] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState('');

  // Player State
  const [playerState, setPlayerState] = useState<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.85,
    isMuted: false,
    isShuffle: false,
    isRepeat: 'off',
    queue: [],
    queueIndex: -1,
  });

  // Tracked artist ID set for fast O(1) lookup
  const trackedArtistIds = new Set(trackedArtists.map(a => a.id));
  // Liked tracks ID set for instant O(1) reactive lookup
  const likedTrackIds = new Set(likedTracks.map(t => t.id));

  // 1. Initial Authentication Check on Mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const user = await getMeApi();
        setCurrentUser(user);
      } catch {
        setCurrentUser(null);
      } finally {
        setIsAuthChecking(false);
      }
    }
    checkAuth();
  }, []);

  // 2. Initialize Collections and Pre-fetch initial hits
  useEffect(() => {
    async function setup() {
      try {
        await initDatabase();
        const artists = await getTrackedArtists();
        const radar = await getRadarTracks();
        const history = await getPlayHistory(50);

        setTrackedArtists(artists);
        setRadarTracks(radar);
        setPlayHistory(history);

        // Pre-populate discover with initial trending query if empty
        const initialHits = await searchTracks('V-Pop Mới Nhất 2026');
        setDiscoverTracks(initialHits);
      } catch (err) {
        console.error('Initialization error:', err);
      }
    }
    setup();
  }, []);

  // 3. When user logs in or is authenticated, restore favorites and playback state from SQLite
  useEffect(() => {
    if (!currentUser) return;

    // Load favorites from SQLite
    getFavoritesApi().then(setLikedTracks).catch(console.warn);

    // Restore exact playback state (Resume Playback)
    getPlaybackStateApi().then((saved) => {
      if (saved && saved.lastTrack) {
        const restoredVol = saved.volume !== undefined ? saved.volume : 0.85;
        const restoredSec = saved.progressSeconds || 0;
        const restoredQueue = saved.queue && saved.queue.length ? saved.queue : [saved.lastTrack];
        const activeIdx = restoredQueue.findIndex(t => t.id === saved.lastTrack!.id);

        setPlayerState(prev => ({
          ...prev,
          currentTrack: saved.lastTrack,
          queue: restoredQueue,
          queueIndex: activeIdx >= 0 ? activeIdx : 0,
          currentTime: restoredSec,
          duration: saved.lastTrack?.duration || 0,
          volume: restoredVol,
          isPlaying: false
        }));

        audioEngine.setVolume(restoredVol);
        audioEngine.seek(restoredSec);

        setToast({
          id: Date.now(),
          message: `Khôi phục tiến trình phát: "${saved.lastTrack.title}" (${Math.floor(restoredSec)}s) 🎵`,
          type: 'info'
        });
      }
    }).catch(console.warn);
  }, [currentUser?.id]);

  // 4. Auto-sync / Debounce Playback Progress to SQLite every 5 seconds (or on track/volume changes)
  useEffect(() => {
    if (!currentUser || !playerState.currentTrack) return;

    // Sync immediately on track/queue/volume change
    syncPlaybackStateApi(
      playerState.currentTrack,
      playerState.currentTime,
      playerState.queue,
      playerState.volume
    );

    // Sync periodically every 5 seconds while listening
    const interval = setInterval(() => {
      if (playerState.currentTrack) {
        syncPlaybackStateApi(
          playerState.currentTrack,
          playerState.currentTime,
          playerState.queue,
          playerState.volume
        );
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [
    currentUser?.id,
    playerState.currentTrack?.id,
    playerState.isPlaying,
    Math.floor(playerState.currentTime / 5), // throttled by 5-second steps
    playerState.volume
  ]);

  // Auto-dismiss toast after 4.5s
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast?.id]);

  // Sync player callbacks with AudioEngine
  useEffect(() => {
    audioEngine.onTimeUpdate = (time) => {
      setPlayerState(prev => ({ ...prev, currentTime: time }));
    };

    audioEngine.onDurationChange = (dur) => {
      setPlayerState(prev => ({ ...prev, duration: dur }));
    };

    audioEngine.onPlayStateChange = (playing) => {
      setPlayerState(prev => ({ ...prev, isPlaying: playing }));
    };

    audioEngine.onEnded = () => {
      if (playerState.currentTrack) {
        recordTrackCompleted(playerState.currentTrack.id);
        getPlayHistory(50).then(setPlayHistory);
      }
      handleNextTrack();
    };

    audioEngine.onError = async (err) => {
      console.warn('Playback audio element error:', err);
      const track = playerState.currentTrack;
      if (!track) return;

      // 1. Tự động thử refresh stream URL mới 1 lần nếu gặp sự kiện audio error (token YouTube 403 hết hạn)
      if (!retriedTrackIdsRef.current.has(track.id)) {
        retriedTrackIdsRef.current.add(track.id);
        console.log(`[Audio Recovery] Tự động lấy stream URL mới nhất cho "${track.title}"...`);
        setToast({
          id: Date.now(),
          message: `Luồng phát cũ hết hạn. Đang làm mới luồng âm thanh cho "${track.title}"...`,
          type: 'info'
        });

        try {
          const { streamUrl, duration } = await resolveStreamUrl(track.id, true);
          if (duration && duration > 0) {
            setPlayerState(prev => ({ ...prev, duration }));
          }
          await audioEngine.play(streamUrl);
          // Hồi phục phát nhạc thành công! Reset đếm lỗi
          consecutiveErrorsRef.current = 0;
          setPlayerError(null);
          return;
        } catch (retryErr) {
          console.warn(`[Audio Recovery] Refresh thất bại cho "${track.title}":`, retryErr);
        }
      }

      // 2. Nếu đã thử refresh mà vẫn lỗi, tính vào lỗi liên tiếp và chuyển bài kế tiếp
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        setToast({
          id: Date.now(),
          message: `Dừng phát do không thể giải mã âm thanh (${MAX_CONSECUTIVE_ERRORS} bài liên tiếp). Vui lòng kiểm tra lại kết nối mạng.`,
          type: 'error'
        });
        setPlayerError(`Đã dừng phát (${MAX_CONSECUTIVE_ERRORS} bài lỗi liên tiếp)`);
        consecutiveErrorsRef.current = 0;
        audioEngine.pause();
      } else {
        setToast({
          id: Date.now(),
          message: `Lỗi bài "${track.title}". Đang chuyển bài tiếp theo (${consecutiveErrorsRef.current}/${MAX_CONSECUTIVE_ERRORS})...`,
          type: 'error'
        });
        setPlayerError(`Lỗi audio: ${track.title}`);
        handleNextTrack();
      }
    };
  }, [playerState.isRepeat, playerState.isShuffle, playerState.queueIndex, playerState.queue, playerState.currentTrack]);

  // Trigger Dynamic Palette extraction when track changes
  useEffect(() => {
    if (playerState.currentTrack?.thumbnail) {
      extractPaletteFromImage(playerState.currentTrack.thumbnail).then(palette => {
        setAmbientGradient(palette.backgroundGradient);
      });
    }
  }, [playerState.currentTrack?.id]);

  // Execute Search
  const handleSearchSubmit = async (queryOverride?: string) => {
    const q = (queryOverride || searchQuery).trim();
    if (!q) return;
    if (queryOverride) setSearchQuery(queryOverride);
    setActiveMoodId(null);
    setIsSearching(true);
    setCurrentView('discover');
    try {
      const [tracks, artists] = await Promise.all([
        searchTracks(q),
        searchArtists(q)
      ]);

      let combinedTracks = tracks;
      // If an artist matched, enrich with the artist's full popular catalog
      if (artists.length > 0 && artists[0].id) {
        try {
          const profile = await getArtistProfile(artists[0].id);
          if (profile && profile.topSongs && profile.topSongs.length > 0) {
            const seen = new Set(profile.topSongs.map(t => t.id));
            const remaining = tracks.filter(t => !seen.has(t.id));
            combinedTracks = [...profile.topSongs, ...remaining];
          }
        } catch (e) {
          console.warn('[Artist Search Enrichment]', e);
        }
      }

      setDiscoverTracks(combinedTracks);
      setDiscoverArtists(artists);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleQuickSearch = (tag: string, moodId?: string) => {
    setSearchQuery(tag);
    if (moodId) {
      setActiveMoodId(moodId);
    } else {
      setActiveMoodId(null);
    }
    setIsSearching(true);
    setCurrentView('discover');
    searchTracks(tag).then(res => {
      setDiscoverTracks(res);
      setIsSearching(false);
    }).catch(() => {
      setIsSearching(false);
    });
  };

  const handleSelectArtistInDiscover = async (artist: Artist) => {
    setSearchQuery(artist.name);
    setActiveMoodId(null);
    setIsSearching(true);
    setCurrentView('discover');
    try {
      const profile = await getArtistProfile(artist.id);
      if (profile && profile.topSongs && profile.topSongs.length > 0) {
        setDiscoverTracks(profile.topSongs);
        setDiscoverArtists([artist]);
      } else {
        await handleSearchSubmit(artist.name);
      }
    } catch {
      await handleSearchSubmit(artist.name);
    } finally {
      setIsSearching(false);
    }
  };

  // Play a specific track
  const handlePlayTrack = async (track: Track, newQueue?: Track[]) => {
    try {
      const isLiked = likedTrackIds.has(track.id) || !!track.isLiked;
      // Strip any stale streamUrl to guarantee on-the-fly resolution
      const { streamUrl: _stale, ...cleanTrackProps } = track;
      const trackWithLiked: Track = { ...cleanTrackProps, isLiked };
      const rawQueue = newQueue || (playerState.queue.length > 0 ? playerState.queue : [trackWithLiked]);
      const activeQueue = rawQueue.map(t => {
        const { streamUrl: __, ...rest } = t;
        return {
          ...rest,
          isLiked: likedTrackIds.has(t.id) || !!t.isLiked
        };
      });
      const activeIndex = activeQueue.findIndex(t => t.id === track.id);

      setPlayerState(prev => ({
        ...prev,
        currentTrack: trackWithLiked,
        queue: activeQueue,
        queueIndex: activeIndex >= 0 ? activeIndex : 0,
        currentTime: 0,
        isPlaying: false,
        isLoading: true,
      }));

      // Luôn giải mã stream URL mới nhất theo thời gian thực (On-the-fly streaming resolution)
      const { streamUrl, duration } = await resolveStreamUrl(track.id, false);
      if (duration && duration > 0) {
        setPlayerState(prev => ({ ...prev, duration }));
      }

      await audioEngine.play(streamUrl);
      // Playback succeeded! Reset error counters & clear retried flag for this track
      consecutiveErrorsRef.current = 0;
      retriedTrackIdsRef.current.delete(track.id);
      setPlayerError(null);
      recordTrackPlay(trackWithLiked);
      getPlayHistory(50).then(setPlayHistory);
    } catch (err) {
      console.error('Failed to play track:', err);

      // Thử lại 1 lần với forceRefresh = true nếu lỗi ngay lần đầu nạp
      if (!retriedTrackIdsRef.current.has(track.id)) {
        retriedTrackIdsRef.current.add(track.id);
        try {
          const { streamUrl, duration } = await resolveStreamUrl(track.id, true);
          if (duration && duration > 0) {
            setPlayerState(prev => ({ ...prev, duration }));
          }
          await audioEngine.play(streamUrl);
          consecutiveErrorsRef.current = 0;
          retriedTrackIdsRef.current.delete(track.id);
          setPlayerError(null);
          recordTrackPlay(track);
          getPlayHistory(50).then(setPlayHistory);
          return;
        } catch (forceErr) {
          console.warn('[Play Retry Failed]:', forceErr);
        }
      }

      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        setToast({
          id: Date.now(),
          message: `Đã dừng phát: Gặp lỗi liên tiếp ${MAX_CONSECUTIVE_ERRORS} bài hát. Vui lòng kiểm tra lại kết nối mạng.`,
          type: 'error'
        });
        setPlayerError(`Đã dừng phát (${MAX_CONSECUTIVE_ERRORS} bài lỗi liên tiếp)`);
        consecutiveErrorsRef.current = 0;
        audioEngine.pause();
        return;
      }

      setToast({
        id: Date.now(),
        message: `Không thể tải "${track.title}". Đang chuyển bài tiếp theo (${consecutiveErrorsRef.current}/${MAX_CONSECUTIVE_ERRORS})...`,
        type: 'error'
      });
      setPlayerError(`Lỗi tải: ${track.title}`);
      handleNextTrack();
    } finally {
      setPlayerState(prev => ({ ...prev, isLoading: false }));
    }
  };

  // Tự động chạy ngầm prefetch stream URL cho bài tiếp theo trong hàng đợi
  useEffect(() => {
    if (!playerState.currentTrack || !playerState.queue.length) return;
    const { queue, queueIndex, isShuffle, isRepeat } = playerState;

    let nextIndex = queueIndex + 1;
    if (isShuffle) {
      const remaining = queue.filter(t => t.id !== playerState.currentTrack?.id);
      if (remaining.length > 0) {
        prefetchTrackStream(remaining[0].id);
      }
    } else {
      if (nextIndex >= queue.length && isRepeat === 'all') {
        nextIndex = 0;
      }
      if (nextIndex < queue.length) {
        const nextTrack = queue[nextIndex];
        if (nextTrack && nextTrack.id && nextTrack.id !== playerState.currentTrack.id) {
          console.log(`[Queue Prefetch] Tự động giải mã trước bài tiếp theo: "${nextTrack.title}" (${nextTrack.id})`);
          prefetchTrackStream(nextTrack.id);
        }
      }
    }
  }, [
    playerState.currentTrack?.id,
    playerState.queueIndex,
    playerState.queue,
    playerState.isShuffle,
    playerState.isRepeat
  ]);

  // Play/Pause toggle
  const handlePlayPause = async () => {
    if (!playerState.currentTrack) return;
    if (playerState.isPlaying) {
      audioEngine.pause();
    } else {
      await audioEngine.resume();
    }
  };

  // Next Track
  const handleNextTrack = useCallback(() => {
    const { queue, queueIndex, isRepeat, isShuffle, currentTrack, currentTime } = playerState;
    if (!queue.length) return;

    // Record early skip if listened < 30s
    if (currentTrack && currentTime < 30) {
      recordTrackSkipped(currentTrack.id);
    }

    if (isRepeat === 'one' && playerState.currentTrack) {
      audioEngine.seek(0);
      audioEngine.resume();
      return;
    }

    let nextIndex = queueIndex + 1;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (nextIndex >= queue.length) {
      if (isRepeat === 'all') {
        nextIndex = 0;
      } else {
        return; // end of queue
      }
    }

    const nextTrack = queue[nextIndex];
    if (nextTrack) {
      handlePlayTrack(nextTrack, queue);
    }
  }, [playerState]);

  // Previous Track
  const handlePrevTrack = () => {
    const { queue, queueIndex, currentTime } = playerState;
    if (currentTime > 3) {
      audioEngine.seek(0);
      return;
    }
    if (queueIndex > 0 && queue[queueIndex - 1]) {
      handlePlayTrack(queue[queueIndex - 1], queue);
    }
  };

  const handleSeek = (sec: number) => {
    audioEngine.seek(sec);
    setPlayerState(prev => ({ ...prev, currentTime: sec }));
  };

  const handleVolumeChange = (vol: number) => {
    audioEngine.setVolume(vol);
    setPlayerState(prev => ({ ...prev, volume: vol, isMuted: false }));
  };

  const handleToggleMute = () => {
    const nextMute = !playerState.isMuted;
    audioEngine.setMuted(nextMute);
    setPlayerState(prev => ({ ...prev, isMuted: nextMute }));
  };

  const handleToggleShuffle = () => {
    setPlayerState(prev => ({ ...prev, isShuffle: !prev.isShuffle }));
  };

  const handleToggleRepeat = () => {
    const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one'];
    const nextIdx = (modes.indexOf(playerState.isRepeat) + 1) % modes.length;
    setPlayerState(prev => ({ ...prev, isRepeat: modes[nextIdx] }));
  };

  // Logout Handler
  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    audioEngine.pause();
    setPlayerState(prev => ({
      ...prev,
      isPlaying: false,
      currentTrack: null
    }));
    setToast({
      id: Date.now(),
      message: 'Đã đăng xuất khỏi Mucis.',
      type: 'info'
    });
  };

  // Like Track Toggle (SQLite Persistence)
  const handleToggleLike = async (track: Track) => {
    try {
      const isNowLiked = await toggleFavoriteApi(track);
      const updatedLiked = await getFavoritesApi();
      setLikedTracks(updatedLiked);

      setPlayerState(prev => ({
        ...prev,
        currentTrack: prev.currentTrack?.id === track.id
          ? { ...prev.currentTrack, isLiked: isNowLiked }
          : prev.currentTrack,
        queue: prev.queue.map(t => t.id === track.id ? { ...t, isLiked: isNowLiked } : t)
      }));

      setToast({
        id: Date.now(),
        message: isNowLiked
          ? `Đã thêm "${track.title}" vào danh sách Yêu thích ❤️`
          : `Đã xóa "${track.title}" khỏi danh sách Yêu thích`,
        type: isNowLiked ? 'success' : 'info'
      });
    } catch (err) {
      console.warn('Failed to toggle favorite:', err);
    }
  };

  // Follow / Unfollow Artist
  const handleTrackArtist = async (artist: Artist) => {
    if (trackedArtistIds.has(artist.id)) {
      await untrackArtist(artist.id);
    } else {
      await trackArtist(artist);
    }
    const updated = await getTrackedArtists();
    setTrackedArtists(updated);
  };

  const handleUntrackArtist = async (artistId: string) => {
    // 1. Lập tức xóa thẻ nghệ sĩ đó khỏi giao diện (Optimistic UI update)
    setTrackedArtists(prev => prev.filter(a => a.id !== artistId));
    
    // 2. Xóa nghệ sĩ khỏi SQLite local database
    await untrackArtist(artistId);
    
    // 3. Cập nhật lại danh sách radar
    const radar = await getRadarTracks();
    setRadarTracks(radar);
  };

  // Trigger Radar Scan
  const handleTriggerRadarSync = async () => {
    if (isSyncingRadar) return;
    setIsSyncingRadar(true);
    setSyncStatusMsg('Đang kích hoạt radar dò tìm bài mới...');

    try {
      const result = await runArtistRadarSync((msg) => {
        setSyncStatusMsg(msg);
      });

      const updatedRadar = await getRadarTracks();
      setRadarTracks(updatedRadar);

      if (result.newTracksCount > 0) {
        setSyncStatusMsg(`Đã tìm thấy và thêm ${result.newTracksCount} bài hát mới vào Radar!`);
      } else {
        setSyncStatusMsg('Tất cả nghệ sĩ theo dõi đã cập nhật đầy đủ bài mới nhất.');
      }
    } catch (err) {
      console.error('Radar sync failed:', err);
      setSyncStatusMsg('Lỗi trong quá trình quét Radar.');
    } finally {
      setIsSyncingRadar(false);
      setTimeout(() => setSyncStatusMsg(''), 6000);
    }
  };

  // ----------------- ROUTE GUARD -----------------
  if (isAuthChecking) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-[#07080c] text-white select-none">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-xs text-zinc-400 font-medium tracking-wider uppercase">Đang nạp Mucis...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginView
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setToast({
            id: Date.now(),
            message: `Chào mừng trở lại, ${user.username}! 🎉`,
            type: 'success'
          });
        }}
      />
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden flex flex-col bg-[#07080c] text-white">
      {/* Dynamic Ambient Mesh Canvas */}
      <AmbientBackground gradient={ambientGradient} />

      {/* Header Bar */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        isSyncingRadar={isSyncingRadar}
        onTriggerSync={handleTriggerRadarSync}
        onOpenGeminiKeys={() => setIsGeminiModalOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 overflow-y-auto px-6 sm:px-10 py-6 max-w-7xl mx-auto w-full pb-36">
        {/* Floating Top Nav Pill */}
        <div className="flex justify-center mb-8">
          <NavigationPill
            currentView={currentView}
            onViewChange={setCurrentView}
            radarBadgeCount={radarTracks.length}
            isAdmin={currentUser.role === 'admin'}
          />
        </div>

        {/* View Switcher */}
        {currentView === 'radar' && (
          <RadarView
            radarTracks={radarTracks}
            onPlayTrack={(track) => handlePlayTrack(track, radarTracks)}
            onPlayAll={() => radarTracks[0] && handlePlayTrack(radarTracks[0], radarTracks)}
            isSyncing={isSyncingRadar}
            onTriggerSync={handleTriggerRadarSync}
            syncStatusMsg={syncStatusMsg}
            onGoToArtists={() => setCurrentView('artists')}
            onToggleLike={handleToggleLike}
            likedTrackIds={likedTrackIds}
          />
        )}

        {currentView === 'ai-recommend' && (
          <AiRecommendView
            onPlayTrack={(track, queue) => handlePlayTrack(track, queue)}
            onOpenGeminiKeys={() => setIsGeminiModalOpen(true)}
            onShowToast={(msg, type = 'info') => {
              setToast({ id: Date.now(), message: msg, type });
            }}
            onToggleLike={handleToggleLike}
            likedTrackIds={likedTrackIds}
          />
        )}

        {currentView === 'discover' && (
          <DiscoverView
            tracks={discoverTracks}
            artists={discoverArtists}
            isLoading={isSearching}
            onPlayTrack={(track, queue) => handlePlayTrack(track, queue || discoverTracks)}
            onToggleLike={handleToggleLike}
            onTrackArtist={handleTrackArtist}
            trackedArtistIds={trackedArtistIds}
            onSelectArtist={handleSelectArtistInDiscover}
            onQuickSearch={handleQuickSearch}
            likedTrackIds={likedTrackIds}
            playHistory={playHistory}
            likedTracks={likedTracks}
            currentTrack={playerState.currentTrack}
            activeMoodId={activeMoodId}
          />
        )}

        {currentView === 'artists' && (
          <ArtistsView
            artists={trackedArtists}
            onTrackArtist={handleTrackArtist}
            onUntrackArtist={handleUntrackArtist}
            onPlayTrack={(track, queue) => handlePlayTrack(track, queue)}
            onRefreshArtists={async () => {
              const updated = await getTrackedArtists();
              setTrackedArtists(updated);
              const radar = await getRadarTracks();
              setRadarTracks(radar);
            }}
            onShowToast={(msg, type = 'info') => {
              setToast({ id: Date.now(), message: msg, type });
            }}
            onToggleLike={handleToggleLike}
            likedTrackIds={likedTrackIds}
          />
        )}

        {currentView === 'library' && (
          <LibraryView
            likedTracks={likedTracks}
            playHistory={playHistory}
            onPlayTrack={(track) => handlePlayTrack(track, likedTracks)}
            onPlayAllLiked={() => likedTracks[0] && handlePlayTrack(likedTracks[0], likedTracks)}
            onToggleLike={handleToggleLike}
            onGoToRadar={() => setCurrentView('radar')}
            trackedArtistsCount={trackedArtists.length}
          />
        )}

        {currentView === 'admin-users' && currentUser.role === 'admin' && (
          <AdminUsersView
            currentUser={currentUser}
            onShowToast={(msg, type = 'info') => {
              setToast({ id: Date.now(), message: msg, type });
            }}
          />
        )}
      </main>

      {/* New Release Celebration Banner */}
      {newReleaseBanner && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-md p-3.5 rounded-2xl bg-[#0f111a]/95 border border-indigo-500/40 shadow-[0_12px_40px_rgba(99,102,241,0.35)] backdrop-blur-2xl flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 shadow border border-white/10">
              <img
                src={newReleaseBanner.thumbnail}
                alt={newReleaseBanner.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Bell className="w-3 h-3 text-cyan-400 animate-bounce" />
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                  Bài hát mới phát hành!
                </span>
              </div>
              <h5 className="text-xs font-bold text-white truncate mt-0.5">
                {newReleaseBanner.title}
              </h5>
              <p className="text-[10px] text-zinc-400 truncate">
                {newReleaseBanner.artist}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                handlePlayTrack(newReleaseBanner);
                setNewReleaseBanner(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-indigo-500 to-cyan-400 text-white shadow-md active:scale-95 transition-all"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Phát ngay</span>
            </button>
            <button
              onClick={() => setNewReleaseBanner(null)}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Glass Dock (Persistent Audio Controls) */}
      <FloatingDock
        playerState={playerState}
        playerError={playerError}
        onPlayPause={handlePlayPause}
        onPrev={handlePrevTrack}
        onNext={handleNextTrack}
        onSeek={handleSeek}
        onVolumeChange={handleVolumeChange}
        onToggleMute={handleToggleMute}
        onToggleShuffle={handleToggleShuffle}
        onToggleRepeat={handleToggleRepeat}
        onToggleLike={handleToggleLike}
        onOpenZen={() => setIsZenMode(true)}
      />

      {/* Floating Non-Intrusive Toast Notification Banner */}
      {toast && (
        <div className="fixed top-16 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#12141f]/95 border border-white/15 text-white shadow-2xl shadow-black/80 backdrop-blur-2xl animate-fade-in max-w-sm">
          <AlertCircle className={`w-4 h-4 flex-shrink-0 ${toast.type === 'error' ? 'text-rose-400' : 'text-cyan-400'}`} />
          <span className="text-xs font-medium leading-snug">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors ml-auto flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Zen Mode Fullscreen Immersion */}
      {isZenMode && (
        <NowPlayingZen
          playerState={playerState}
          onClose={() => setIsZenMode(false)}
          onPlayPause={handlePlayPause}
          onPrev={handlePrevTrack}
          onNext={handleNextTrack}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          onToggleLike={handleToggleLike}
        />
      )}

      {/* Gemini Setup Modal */}
      <LinkYouTubeModal
        isOpen={isGeminiModalOpen}
        onClose={() => setIsGeminiModalOpen(false)}
        onShowToast={(msg, type = 'info') => {
          setToast({ id: Date.now(), message: msg, type });
        }}
      />
    </div>
  );
};

export default App;
