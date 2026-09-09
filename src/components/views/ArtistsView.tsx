import React, { useState } from 'react';
import {
  Users,
  UserMinus,
  RefreshCw,
  Play,
  Disc,
  Disc3,
  Sparkles,
  Plus,
  Search,
  ExternalLink,
  Check,
  Radio,
  Clock,
  Music2,
  Bell,
  Heart,
  X,
  BookOpen,
  FolderHeart
} from 'lucide-react';
import { Artist, Track } from '../../types';
import { getArtistProfile, lookupArtist } from '../../services/youtube';
import { syncSingleArtist } from '../../services/radarSync';

interface ArtistsViewProps {
  artists: Artist[];
  onTrackArtist: (artist: Artist) => void;
  onUntrackArtist: (artistId: string) => void;
  onPlayTrack: (track: Track, queue?: Track[]) => void;
  onRefreshArtists: () => void;
  onShowToast: (message: string, type?: 'info' | 'error' | 'success') => void;
  onToggleLike?: (track: Track) => void;
  likedTrackIds?: Set<string>;
}

function formatTimeAgo(timestamp?: number): string {
  if (!timestamp) return 'Chưa quét';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

export const ArtistsView: React.FC<ArtistsViewProps> = ({
  artists,
  onTrackArtist,
  onUntrackArtist,
  onPlayTrack,
  onRefreshArtists,
  onShowToast,
  onToggleLike,
  likedTrackIds
}) => {
  // Input search/add state
  const [addInput, setAddInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<Artist | null>(null);

  // Sync state per artist
  const [syncingArtistId, setSyncingArtistId] = useState<string | null>(null);

  // Modal artist detail view state
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [artistTopSongs, setArtistTopSongs] = useState<Track[]>([]);
  const [artistAlbums, setArtistAlbums] = useState<any[]>([]);
  const [artistSingles, setArtistSingles] = useState<any[]>([]);
  const [artistBio, setArtistBio] = useState<string>('');
  const [modalTab, setModalTab] = useState<'songs' | 'albums' | 'bio'>('songs');
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [visibleSongsCount, setVisibleSongsCount] = useState(15);

  // Search filter inside tracked artists
  const [filterKeyword, setFilterKeyword] = useState('');

  const filteredArtists = artists.filter(a =>
    a.name.toLowerCase().includes(filterKeyword.toLowerCase()) ||
    a.id.toLowerCase().includes(filterKeyword.toLowerCase())
  );

  // Handle Lookup & Add Artist
  const handleLookupAndAdd = async () => {
    if (!addInput.trim()) return;
    setIsLookingUp(true);
    setLookupResult(null);

    try {
      const found = await lookupArtist(addInput.trim());
      if (found) {
        setLookupResult(found);
        await onTrackArtist(found);
        onShowToast(`Đã thêm nghệ sĩ "${found.name}" vào danh sách theo dõi!`, 'success');
        setAddInput('');
      } else {
        onShowToast('Không tìm thấy nghệ sĩ với thông tin đã nhập.', 'error');
      }
    } catch (err) {
      console.error('Error adding artist:', err);
      onShowToast('Lỗi khi tra cứu nghệ sĩ.', 'error');
    } finally {
      setIsLookingUp(false);
    }
  };

  // Handle Sync for a single artist
  const handleSyncArtist = async (artist: Artist) => {
    setSyncingArtistId(artist.id);
    try {
      const { newTracks, totalReleases } = await syncSingleArtist(artist);
      if (newTracks.length > 0) {
        onShowToast(`🎉 Đã phát hiện ${newTracks.length} bài hát mới từ ${artist.name}! Đã thêm vào Radar.`, 'success');
      } else {
        onShowToast(`${artist.name}: Đã cập nhật (${totalReleases} bài), không có bài mới thêm.`, 'info');
      }
      onRefreshArtists();
    } catch (err: any) {
      console.error('Sync failed for artist:', err);
      onShowToast(`Lỗi khi quét bài mới của ${artist.name}`, 'error');
    } finally {
      setSyncingArtistId(null);
    }
  };

  // Open Artist Detail View Modal
  const handleOpenDiscography = async (artist: Artist) => {
    setSelectedArtist(artist);
    setIsLoadingProfile(true);
    setArtistTopSongs([]);
    setArtistAlbums([]);
    setArtistSingles([]);
    setArtistBio(artist.description || '');
    setModalTab('songs');
    setVisibleSongsCount(15);

    try {
      const data = await getArtistProfile(artist.id);
      if (data) {
        setArtistTopSongs(data.topSongs || []);
        setArtistSingles(data.singles || []);
        setArtistAlbums(data.albums || []);
        if (data.artist?.description) {
          setArtistBio(data.artist.description);
        }
      }
    } catch (err) {
      console.error('Error fetching artist profile:', err);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  return (
    <div className="space-y-6 pb-36">
      {/* Top Banner: Stats & Direct Add Form */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-indigo-950/50 via-purple-950/40 to-black/60 border border-white/10 backdrop-blur-2xl shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Header Description */}
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-3">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span>Hệ Thống Theo Dõi Nghệ Sĩ Thông Minh</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Quản Lý Nghệ Sĩ Theo Dõi
            </h2>
            <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
              Theo dõi nghệ sĩ qua YouTube Channel ID (UC...), YouTube URL, @handle hoặc tên ca sĩ.
              Hệ thống tự động giám sát đĩa đơn và ca khúc mới phát hành để đẩy vào Radar của bạn.
            </p>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-3 self-start lg:self-center">
            <div className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-center">
              <span className="text-2xl font-black text-indigo-400">
                {artists.length}
              </span>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mt-0.5">
                Nghệ sĩ
              </p>
            </div>
          </div>
        </div>

        {/* Search / Add Artist Form Input */}
        <div className="mt-6 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Nhập Channel ID (UC...), YouTube URL, @handle hoặc tên ca sĩ..."
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookupAndAdd()}
              className="w-full h-11 pl-10 pr-4 bg-white/5 hover:bg-white/8 focus:bg-white/10 text-xs text-white placeholder-zinc-500 rounded-2xl border border-white/12 focus:border-indigo-500 focus:outline-none transition-all"
            />
          </div>

          <button
            onClick={handleLookupAndAdd}
            disabled={isLookingUp || !addInput.trim()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 h-11 rounded-2xl text-xs font-bold bg-gradient-to-r from-indigo-500 via-purple-600 to-cyan-400 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 active:scale-95 transition-all disabled:opacity-40 flex-shrink-0"
          >
            {isLookingUp ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span>{isLookingUp ? 'Đang tra cứu...' : 'Thêm nghệ sĩ'}</span>
          </button>
        </div>
      </div>

      {/* Filter / Search inside tracked artists */}
      {artists.length > 0 && (
        <div className="flex items-center justify-between gap-4 px-1">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Lọc trong danh sách đã theo dõi..."
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              className="w-full h-8 pl-8 pr-3 bg-white/5 text-xs text-zinc-200 placeholder-zinc-500 rounded-xl border border-white/8 focus:outline-none focus:border-indigo-500/40"
            />
          </div>

          <span className="text-xs text-zinc-400 font-medium">
            Hiển thị {filteredArtists.length}/{artists.length} nghệ sĩ
          </span>
        </div>
      )}

      {/* Artists Grid */}
      {filteredArtists.length === 0 ? (
        <div className="glass-card rounded-3xl p-12 text-center max-w-md mx-auto">
          <Users className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">
            {artists.length === 0 ? 'Chưa có nghệ sĩ nào trong danh sách' : 'Không có nghệ sĩ phù hợp bộ lọc'}
          </h3>
          <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
            {artists.length === 0
              ? 'Hãy nhập Channel ID, URL hoặc tên nghệ sĩ ở khung trên để bắt đầu theo dõi bài mới tự động.'
              : 'Hãy thử xóa từ khóa lọc để hiển thị toàn bộ nghệ sĩ.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredArtists.map((artist) => {
            const isSyncing = syncingArtistId === artist.id;

            return (
              <div
                key={artist.id}
                className="glass-card group rounded-3xl p-5 flex flex-col justify-between border border-white/8 hover:border-indigo-500/40 transition-all duration-300 relative overflow-hidden"
              >
                {/* Artist Info Top - Clickable Avatar & Name */}
                <div className="flex items-center gap-3.5">
                  <div
                    onClick={() => handleOpenDiscography(artist)}
                    className="relative w-16 h-16 rounded-2xl overflow-hidden border-2 border-white/10 shadow-md flex-shrink-0 cursor-pointer group-hover:scale-105 group-hover:border-indigo-400/60 transition-all duration-300"
                    title={`Bấm để xem chi tiết nghệ sĩ ${artist.name}`}
                  >
                    <img
                      src={artist.thumbnail}
                      alt={artist.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-indigo-950/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4
                      onClick={() => handleOpenDiscography(artist)}
                      className="text-sm font-bold text-white truncate cursor-pointer hover:text-indigo-300 transition-colors"
                      title={`Bấm để xem chi tiết nghệ sĩ ${artist.name}`}
                    >
                      {artist.name}
                    </h4>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {artist.subscribers || 'YouTube Music Artist'}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-1">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      <span>{formatTimeAgo(artist.lastSyncedAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-5 pt-4 border-t border-white/5 flex items-center gap-2">
                  {/* Sync Button */}
                  <button
                    onClick={() => handleSyncArtist(artist)}
                    disabled={isSyncing}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 transition-all active:scale-95 disabled:opacity-50"
                    title="Dò tìm bài hát mới của nghệ sĩ này"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>{isSyncing ? 'Đang quét...' : 'Quét bài mới'}</span>
                  </button>

                  {/* View Details / Discography Button */}
                  <button
                    onClick={() => handleOpenDiscography(artist)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/8 transition-colors"
                    title="Xem chi tiết, đĩa nhạc và bài hát nổi bật"
                  >
                    <Music2 className="w-4 h-4" />
                  </button>

                  {/* Untrack Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUntrackArtist(artist.id);
                      onShowToast(`Đã bỏ theo dõi ${artist.name}`, 'info');
                    }}
                    className="p-2 rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/15 transition-all duration-200 active:scale-90"
                    title={`Bỏ theo dõi ${artist.name}`}
                  >
                    <UserMinus className="w-4 h-4 text-rose-400/80 hover:text-rose-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Artist Detail View Modal (Bio, Albums, Top Songs, Heart Like) */}
      {selectedArtist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xl animate-fade-in">
          <div className="glass-panel w-full max-w-3xl max-h-[90vh] rounded-3xl p-5 sm:p-7 flex flex-col overflow-hidden shadow-2xl border border-white/15 bg-zinc-950/90">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-5 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-4 min-w-0">
                <img
                  src={selectedArtist.thumbnail}
                  alt={selectedArtist.name}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-indigo-400/40 shadow-xl flex-shrink-0"
                />
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-1">
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    <span>Nghệ sĩ YouTube Music</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white truncate">
                    {selectedArtist.name}
                  </h3>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    {selectedArtist.subscribers || 'Nghệ sĩ đang theo dõi'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <button
                  onClick={() => handleSyncArtist(selectedArtist)}
                  disabled={syncingArtistId === selectedArtist.id}
                  className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 transition-all active:scale-95 disabled:opacity-50"
                  title="Quét bài mới của nghệ sĩ này"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingArtistId === selectedArtist.id ? 'animate-spin text-cyan-400' : ''}`} />
                  <span>Quét bài mới</span>
                </button>
                <button
                  onClick={() => setSelectedArtist(null)}
                  className="p-2 sm:px-4 sm:py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-zinc-200 transition-colors flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Đóng</span>
                </button>
              </div>
            </div>

            {/* Short Bio Banner if available */}
            {artistBio && (
              <div className="mt-4 p-3.5 rounded-2xl bg-white/[0.03] border border-white/8 flex items-start gap-2.5 flex-shrink-0">
                <BookOpen className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed">
                    {artistBio}
                  </p>
                </div>
              </div>
            )}

            {/* Tab Navigation */}
            <div className="flex items-center gap-2 mt-4 pb-2 border-b border-white/10 flex-shrink-0">
              <button
                onClick={() => setModalTab('songs')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  modalTab === 'songs'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Music2 className="w-3.5 h-3.5" />
                <span>Bài hát nổi bật ({artistTopSongs.length})</span>
              </button>

              <button
                onClick={() => setModalTab('albums')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  modalTab === 'albums'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Disc3 className="w-3.5 h-3.5" />
                <span>Album & Đĩa đơn ({artistAlbums.length + artistSingles.length})</span>
              </button>

              {artistBio && (
                <button
                  onClick={() => setModalTab('bio')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    modalTab === 'bio'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Tiểu sử chi tiết</span>
                </button>
              )}
            </div>

            {/* Modal Body Content */}
            <div className="flex-1 overflow-y-auto py-4 pr-1">
              {isLoadingProfile ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Disc className="w-8 h-8 text-indigo-400 animate-spin" />
                  <p className="mt-3 text-xs text-zinc-400">Đang tải thông tin và đĩa nhạc từ YouTube Music...</p>
                </div>
              ) : modalTab === 'songs' ? (
                /* Tab 1: Top Songs */
                artistTopSongs.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 text-xs">
                    Chưa tìm thấy bài hát nổi bật nào.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {artistTopSongs.slice(0, visibleSongsCount).map((track) => {
                      const isLiked = (likedTrackIds && likedTrackIds.has(track.id)) || !!track.isLiked;
                      return (
                        <div
                          key={track.id}
                          onClick={() => onPlayTrack(track, artistTopSongs)}
                          className="glass-card group flex items-center justify-between p-3 rounded-2xl cursor-pointer hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-800 shadow">
                              <img
                                src={track.thumbnail || selectedArtist.thumbnail}
                                alt={track.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Play className="w-3.5 h-3.5 fill-white text-white" />
                              </div>
                            </div>
                            <div className="min-w-0">
                              <h5 className="text-xs font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                                {track.title}
                              </h5>
                              <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                                {track.album || selectedArtist.name}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            {/* Heart Button */}
                            {onToggleLike && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleLike(track);
                                }}
                                className="p-2 text-zinc-400 hover:text-rose-400 active:scale-90 transition-transform"
                                title={isLiked ? 'Bỏ thích' : 'Yêu thích'}
                              >
                                <Heart
                                  className={`w-4 h-4 transition-all duration-200 ${
                                    isLiked
                                      ? 'fill-rose-500 text-rose-500 scale-110 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                                      : 'hover:text-rose-400'
                                  }`}
                                />
                              </button>
                            )}

                            {/* Play Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onPlayTrack(track, artistTopSongs);
                              }}
                              className="p-2.5 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20 hover:scale-105 active:scale-95 transition-all"
                            >
                              <Play className="w-3.5 h-3.5 fill-white" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {artistTopSongs.length > visibleSongsCount && (
                      <div className="flex justify-center pt-3 pb-1">
                        <button
                          onClick={() => setVisibleSongsCount(prev => prev + 15)}
                          className="px-5 py-2.5 rounded-2xl text-xs font-bold bg-indigo-600/20 hover:bg-indigo-600/35 text-indigo-300 border border-indigo-500/30 hover:border-indigo-400/60 shadow-lg transition-all active:scale-95 flex items-center gap-2"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Xem thêm bài hát (còn {artistTopSongs.length - visibleSongsCount} bài)</span>
                        </button>
                      </div>
                    )}
                  </div>
                )
              ) : modalTab === 'albums' ? (
                /* Tab 2: Albums & Singles */
                (artistAlbums.length === 0 && artistSingles.length === 0) ? (
                  <div className="text-center py-12 text-zinc-500 text-xs">
                    Chưa có dữ liệu album hoặc đĩa đơn từ YouTube Music.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {/* Albums */}
                    {artistAlbums.map((album) => (
                      <div
                        key={album.id || album.title}
                        className="glass-card p-3 rounded-2xl flex flex-col group border border-white/5 hover:border-indigo-500/30 transition-all"
                      >
                        <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-zinc-800 shadow mb-2.5">
                          <img
                            src={album.thumbnail || selectedArtist.thumbnail}
                            alt={album.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-indigo-600/80 text-[9px] font-bold text-white uppercase tracking-wider backdrop-blur-sm">
                            Album
                          </div>
                        </div>
                        <h5 className="text-xs font-bold text-white truncate group-hover:text-indigo-300 transition-colors">
                          {album.title}
                        </h5>
                        {album.year && (
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            {album.year}
                          </p>
                        )}
                      </div>
                    ))}

                    {/* Singles */}
                    {artistSingles.map((single) => (
                      <div
                        key={single.id || single.title}
                        className="glass-card p-3 rounded-2xl flex flex-col group border border-white/5 hover:border-indigo-500/30 transition-all"
                      >
                        <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-zinc-800 shadow mb-2.5">
                          <img
                            src={single.thumbnail || selectedArtist.thumbnail}
                            alt={single.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-purple-600/80 text-[9px] font-bold text-white uppercase tracking-wider backdrop-blur-sm">
                            Đĩa đơn
                          </div>
                        </div>
                        <h5 className="text-xs font-bold text-white truncate group-hover:text-indigo-300 transition-colors">
                          {single.title}
                        </h5>
                        {single.year && (
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            {single.year}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                /* Tab 3: Detailed Bio */
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/8 text-zinc-300 text-xs leading-relaxed whitespace-pre-line">
                  <div className="flex items-center gap-2 text-indigo-400 font-bold mb-3 text-sm">
                    <BookOpen className="w-4 h-4" />
                    <span>Tiểu sử nghệ sĩ</span>
                  </div>
                  {artistBio || 'Chưa có thông tin tiểu sử chi tiết từ YouTube Music.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
