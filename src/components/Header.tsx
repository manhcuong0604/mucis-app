import React, { useState, useEffect, useRef } from 'react';
import { Search, Minus, Square, X, Disc3, Radio, Sparkles, KeyRound, User as UserIcon, LogOut, ShieldCheck } from 'lucide-react';
import { getSearchSuggestions } from '../services/youtube';
import { User } from '../types';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit: (queryOverride?: string) => void;
  isSyncingRadar: boolean;
  onTriggerSync: () => void;
  onOpenGeminiKeys: () => void;
  currentUser?: User | null;
  onLogout?: () => void;
}

const QUICK_SUGGEST_CHIPS = [
  'V-Pop Mới',
  'Chill & Lofi',
  'Acoustic Thư Giãn',
  'Nhạc Trẻ 2026',
  'Remix TikTok',
  'Ballad Buồn',
  'US-UK Hot',
  'Rap Việt'
];

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  isSyncingRadar,
  onTriggerSync,
  onOpenGeminiKeys,
  currentUser,
  onLogout,
}) => {
  const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedChipIndex, setHighlightedChipIndex] = useState<number>(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const chipsScrollRef = useRef<HTMLDivElement>(null);

  // Active chips for the Suggest Bar
  const displayChips = suggestions.length > 0 ? suggestions.slice(0, 8) : QUICK_SUGGEST_CHIPS;

  // Debounced search autocomplete (300ms)
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const list = await getSearchSuggestions(trimmed);
        setSuggestions(list);
        setShowDropdown(list.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside to close dropdown & suggest bar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setIsFocused(false);
        setHighlightedChipIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto scroll highlighted chip into view
  useEffect(() => {
    if (highlightedChipIndex >= 0 && chipsScrollRef.current) {
      const chipElement = chipsScrollRef.current.children[highlightedChipIndex] as HTMLElement;
      if (chipElement) {
        chipElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [highlightedChipIndex]);

  const handleSelectSuggestion = (item: string) => {
    onSearchChange(item);
    setShowDropdown(false);
    setIsFocused(false);
    setHighlightedChipIndex(-1);
    onSearchSubmit(item);
  };

  const handleMinimize = () => {
    (window as any).electronAPI?.minimizeWindow();
  };

  const handleMaximize = () => {
    (window as any).electronAPI?.maximizeWindow();
  };

  const handleClose = () => {
    (window as any).electronAPI?.closeWindow();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowRight') {
      if (displayChips.length > 0) {
        e.preventDefault();
        setShowDropdown(true);
        setHighlightedChipIndex((prev) => (prev + 1) % displayChips.length);
      }
    } else if (e.key === 'ArrowLeft') {
      if (displayChips.length > 0) {
        e.preventDefault();
        setShowDropdown(true);
        setHighlightedChipIndex((prev) => (prev <= 0 ? displayChips.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedChipIndex >= 0 && displayChips[highlightedChipIndex]) {
        handleSelectSuggestion(displayChips[highlightedChipIndex]);
      } else {
        setShowDropdown(false);
        setIsFocused(false);
        onSearchSubmit();
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setIsFocused(false);
      setHighlightedChipIndex(-1);
    }
  };

  return (
    <header className="relative z-30 flex items-center justify-between px-6 py-3 border-b border-white/5 bg-black/20 backdrop-blur-md select-none" style={{ WebkitAppRegion: 'drag' } as any}>
      {/* Brand & App Title */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-400 p-[1.5px] shadow-lg shadow-indigo-500/20">
          <div className="w-full h-full bg-[#0d0f18] rounded-[10px] flex items-center justify-center">
            <Disc3 className="w-4 h-4 text-indigo-400 animate-spin-slow" />
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-wider bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            MUCIS
          </span>
          <span className="text-[10px] text-zinc-500 tracking-tight font-medium -mt-1">
            Autonomous Soundscape • Local-First
          </span>
        </div>
      </div>

      {/* Global Search Bar with Autocomplete Dropdown & Arrow-Navigable Suggest Bar */}
      <div ref={searchContainerRef} className="relative flex-1 max-w-md mx-6" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 w-4 h-4 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Tìm bài hát, ca sĩ, album trên YouTube Music... (Dùng ← → duyệt gợi ý)"
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setHighlightedChipIndex(-1);
              if (!showDropdown && e.target.value.trim().length >= 2) {
                setShowDropdown(true);
              }
            }}
            onFocus={() => {
              setIsFocused(true);
              if (suggestions.length > 0 || !searchQuery.trim()) {
                setShowDropdown(true);
              }
            }}
            onKeyDown={handleKeyDown}
            className="w-full h-9 pl-10 pr-10 bg-white/5 hover:bg-white/8 focus:bg-white/10 text-xs text-zinc-100 placeholder-zinc-500 rounded-full border border-white/10 focus:border-indigo-500/50 focus:outline-none transition-all duration-200 shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => {
                onSearchChange('');
                setSuggestions([]);
                setShowDropdown(false);
                setHighlightedChipIndex(-1);
              }}
              className="absolute right-3 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Suggest Bar & Suggestions Dropdown */}
        {(showDropdown || isFocused) && (
          <div className="absolute top-full left-0 right-0 mt-2 p-2.5 rounded-2xl bg-zinc-900/95 border border-white/15 backdrop-blur-2xl shadow-[0_20px_40px_rgba(0,0,0,0.8)] z-50 overflow-hidden animate-fade-in space-y-2">
            {/* Header with Navigation Hint */}
            <div className="flex items-center justify-between px-1 text-[10px] text-zinc-400">
              <span className="font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                Thanh gợi ý (Suggest Bar)
              </span>
              <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded border border-white/10 text-indigo-300 font-mono">
                Phím ← → duyệt • Enter chọn
              </span>
            </div>

            {/* Horizontal Suggest Bar Chips */}
            <div
              ref={chipsScrollRef}
              className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none select-none"
            >
              {displayChips.map((chip, idx) => {
                const isHighlighted = highlightedChipIndex === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onMouseDown={() => handleSelectSuggestion(chip)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all duration-150 border ${
                      isHighlighted
                        ? 'bg-gradient-to-r from-indigo-500 via-purple-600 to-cyan-400 text-white font-semibold border-transparent shadow-[0_0_12px_rgba(99,102,241,0.7)] scale-105 ring-2 ring-indigo-400/80'
                        : 'bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border-white/10'
                    }`}
                  >
                    <Search className={`w-3 h-3 ${isHighlighted ? 'text-white' : 'text-indigo-400'}`} />
                    <span>{chip}</span>
                  </button>
                );
              })}
            </div>

            {/* Vertical suggestions list when typed */}
            {suggestions.length > 0 && (
              <div className="pt-2 border-t border-white/8 space-y-0.5">
                {suggestions.slice(0, 5).map((item, idx) => (
                  <div
                    key={idx}
                    onMouseDown={() => handleSelectSuggestion(item)}
                    className="px-3 py-1.5 hover:bg-white/10 rounded-lg cursor-pointer flex items-center gap-2 text-xs text-zinc-300 hover:text-white transition-colors"
                  >
                    <Search className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                    <span className="truncate">{item}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Controls: Gemini Keys & Radar Trigger & Window Buttons */}
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          onClick={onOpenGeminiKeys}
          title="Cấu hình Gemini AI Multi-Key Fallback"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 transition-all duration-200 active:scale-95"
        >
          <KeyRound className="w-3.5 h-3.5 text-purple-400" />
          <span>Gemini Keys</span>
        </button>

        <button
          onClick={onTriggerSync}
          disabled={isSyncingRadar}
          title="Quét bài mới từ nghệ sĩ theo dõi"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 transition-all duration-200 active:scale-95 disabled:opacity-50"
        >
          <Radio className={`w-3.5 h-3.5 ${isSyncingRadar ? 'animate-spin text-cyan-400' : 'text-indigo-400'}`} />
          <span>{isSyncingRadar ? 'Đang quét...' : 'Radar Sync'}</span>
        </button>

        {currentUser && (
          <div className="flex items-center gap-2 pl-2 border-l border-white/10">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
              {currentUser.role === 'admin' ? (
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              ) : (
                <UserIcon className="w-3.5 h-3.5 text-zinc-400" />
              )}
              <span className="text-xs font-semibold text-zinc-200 max-w-[100px] truncate">
                {currentUser.username}
              </span>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                currentUser.role === 'admin'
                  ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40'
                  : 'bg-zinc-800 text-zinc-400'
              }`}>
                {currentUser.role === 'admin' ? 'Admin' : 'User'}
              </span>
            </div>

            {onLogout && (
              <button
                onClick={onLogout}
                title="Đăng xuất khỏi Mucis"
                className="p-1.5 rounded-full text-zinc-400 hover:text-rose-400 hover:bg-rose-500/15 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {isElectron && (
          <div className="flex items-center gap-1 ml-2 border-l border-white/10 pl-3">
            <button
              onClick={handleMinimize}
              aria-label="Thu nhỏ"
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 rounded-md transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleMaximize}
              aria-label="Phóng to"
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 rounded-md transition-colors"
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              onClick={handleClose}
              aria-label="Đóng ứng dụng"
              className="p-1.5 text-zinc-400 hover:text-rose-300 hover:bg-rose-500/20 rounded-md transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
