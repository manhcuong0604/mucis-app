import React, { useState, useEffect } from 'react';
import { 
  X, 
  ExternalLink, 
  Sparkles, 
  KeyRound, 
  Check, 
  Plus,
  Trash2,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { getGeminiApiKeys, saveGeminiApiKeys } from '../../services/auth';

interface GeminiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'info' | 'error' | 'success') => void;
  // Deprecated auth callbacks kept for compatibility
  onAuthSuccess?: () => void;
  onSelectGuestPreferences?: (artists: string[], genres: string[]) => void;
  initialTab?: string;
}

export const LinkYouTubeModal: React.FC<GeminiSettingsModalProps> = ({
  isOpen,
  onClose,
  onShowToast,
}) => {
  const [geminiKeys, setGeminiKeys] = useState<string[]>([]);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [isSavingKeys, setIsSavingKeys] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadGeminiKeys();
  }, [isOpen]);

  const loadGeminiKeys = async () => {
    try {
      const keys = await getGeminiApiKeys();
      setGeminiKeys(keys);
    } catch {
      setGeminiKeys([]);
    }
  };

  const handleAddKeys = () => {
    if (!newKeyInput.trim()) return;
    const splitKeys = newKeyInput
      .replace(/\n/g, ',')
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 5);

    if (splitKeys.length === 0) {
      onShowToast('Key không hợp lệ. Vui lòng kiểm tra lại.', 'error');
      return;
    }

    const updated = Array.from(new Set([...geminiKeys, ...splitKeys]));
    setGeminiKeys(updated);
    setNewKeyInput('');
    onShowToast(`Đã thêm ${splitKeys.length} API Key vào danh sách. Hãy nhấn "Lưu thay đổi".`, 'info');
  };

  const handleRemoveKey = (indexToRemove: number) => {
    setGeminiKeys(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleClearAll = () => {
    setGeminiKeys([]);
  };

  const handleSaveKeys = async () => {
    setIsSavingKeys(true);
    try {
      await saveGeminiApiKeys(geminiKeys);
      onShowToast(`Đã lưu ${geminiKeys.length} Gemini API Key vào bộ nhớ SQLite an toàn!`, 'success');
      onClose();
    } catch (err: any) {
      console.error('Failed to save keys:', err);
      onShowToast('Lỗi khi lưu keys: ' + (err?.message || ''), 'error');
    } finally {
      setIsSavingKeys(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#0e1017] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.9)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/8 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-500/20 border border-purple-500/30 text-purple-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Cấu hình Gemini AI Keys
              </h2>
              <p className="text-xs text-zinc-400">
                Multi-Key Fallback • Tự động xoay vòng khi chạm hạn ngạch
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div className="p-3.5 rounded-2xl bg-purple-950/25 border border-purple-500/20 text-xs text-purple-200 leading-relaxed flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Cơ chế bảo vệ Quota 429:</span> Khi một Key trả về mã lỗi 429 (Resource Exhausted), 
              Mucis tự động chuyển sang Key tiếp theo trong danh sách mà không gián đoạn trải nghiệm của bạn.
            </div>
          </div>

          {/* Key Input Field */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span>Nhập Gemini API Key (Có thể dán nhiều key cách nhau bằng dấu phẩy)</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium underline"
              >
                <span>Lấy key miễn phí</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </label>

            <div className="flex gap-2">
              <input
                type="password"
                placeholder="AIzaSy..., AIzaSy..."
                value={newKeyInput}
                onChange={(e) => setNewKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddKeys()}
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 focus:border-purple-500/50 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none transition-all"
              />
              <button
                onClick={handleAddKeys}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors flex-shrink-0 active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm</span>
              </button>
            </div>
          </div>

          {/* Active Keys Chips */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
              <span>Danh sách Key dự phòng ({geminiKeys.length})</span>
              {geminiKeys.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-[11px] text-rose-400 hover:text-rose-300 transition-colors"
                >
                  Xóa tất cả
                </button>
              )}
            </div>

            {geminiKeys.length === 0 ? (
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center text-xs text-zinc-500">
                Chưa có API Key nào được lưu. Hãy thêm ít nhất 1 key từ Google AI Studio để kích hoạt tính năng đề xuất nhạc.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
                {geminiKeys.map((k, idx) => {
                  const masked = k.length > 10 ? `${k.substring(0, 6)}...${k.substring(k.length - 4)}` : 'Key #' + (idx + 1);
                  return (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-200"
                    >
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span className="font-mono text-[11px]">{masked}</span>
                      <button
                        onClick={() => handleRemoveKey(idx)}
                        className="p-0.5 hover:text-rose-400 rounded-full transition-colors text-zinc-500"
                        title="Xóa key này"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-white/8 bg-white/[0.02]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
          >
            Đóng
          </button>
          <button
            onClick={handleSaveKeys}
            disabled={isSavingKeys}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSavingKeys ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const GeminiSettingsModal = LinkYouTubeModal;
