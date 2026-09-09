import React, { useState } from 'react';
import { User, Lock, Eye, EyeOff, Sparkles, Music4, LogIn, AlertCircle, ShieldCheck } from 'lucide-react';
import { loginApi } from '../../services/authService';
import { User as UserType } from '../../types';

interface LoginViewProps {
  onLoginSuccess: (user: UserType, token: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const data = await loginApi(username.trim(), password);
      onLoginSuccess(data.user, data.token);
    } catch (err: any) {
      setErrorMsg(err.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseDefaultAdmin = () => {
    setUsername('admin');
    setPassword('admin123');
    setErrorMsg(null);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden flex items-center justify-center bg-[#07080c] select-none">
      {/* Background Ambient Glowing Lights */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 rounded-full bg-indigo-600/25 blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 rounded-full bg-purple-600/20 blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />

      {/* Main Glassmorphic Login Card */}
      <div className="relative z-10 w-full max-w-md p-8 sm:p-10 mx-4 rounded-3xl bg-black/50 backdrop-blur-3xl border border-white/12 shadow-[0_24px_70px_rgba(0,0,0,0.8),_0_0_30px_rgba(99,102,241,0.2)] flex flex-col animate-fade-in">
        
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-600 to-cyan-400 p-0.5 shadow-xl shadow-indigo-500/30 mb-4 group hover:scale-105 transition-transform duration-300">
            <div className="w-full h-full bg-[#0d0f18] rounded-[14px] flex items-center justify-center">
              <Music4 className="w-8 h-8 text-cyan-400 animate-pulse" />
            </div>
          </div>
          
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Mucis Desktop & Web</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Đăng Nhập Tài Khoản
          </h1>
          <p className="text-xs text-zinc-400 mt-1.5">
            Hệ thống nghe nhạc & tự động khôi phục tiến trình phát
          </p>
        </div>

        {/* Error Alert Message */}
        {errorMsg && (
          <div className="mb-6 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5 animate-fade-in">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username Input */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5 ml-1">
              Tên đăng nhập
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập tên tài khoản..."
                className="w-full h-11 pl-10 pr-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                disabled={isLoading}
                autoFocus
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5 ml-1">
              Mật khẩu
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu..."
                className="w-full h-11 pl-10 pr-11 rounded-2xl bg-white/5 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 h-11 rounded-2xl text-xs font-bold bg-gradient-to-r from-indigo-500 via-purple-600 to-cyan-400 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Đăng nhập vào Mucis</span>
              </>
            )}
          </button>
        </form>

        {/* Admin Quick Fill Banner */}
        <div className="mt-6 pt-5 border-t border-white/10 flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Tài khoản Admin mặc định:</span>
            <button
              onClick={handleUseDefaultAdmin}
              className="font-mono text-cyan-300 font-semibold hover:underline bg-white/5 px-2 py-0.5 rounded-md border border-white/8 ml-1"
              title="Bấm để tự điền admin / admin123"
            >
              admin / admin123
            </button>
          </div>
          <p className="text-[10px] text-zinc-500 mt-1">
            Chỉ quản trị viên mới có quyền tạo thêm tài khoản cho người dùng.
          </p>
        </div>

      </div>
    </div>
  );
};
