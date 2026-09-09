import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Trash2,
  ShieldCheck,
  User as UserIcon,
  RefreshCw,
  X,
  Lock,
  Calendar,
  AlertCircle,
  KeyRound
} from 'lucide-react';
import { User } from '../../types';
import { getAdminUsers, createAdminUser, deleteAdminUser } from '../../services/authService';

interface AdminUsersViewProps {
  currentUser: User;
  onShowToast: (message: string, type?: 'info' | 'error' | 'success') => void;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({ currentUser, onShowToast }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State for Add User
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const list = await getAdminUsers();
      setUsers(list);
    } catch (err: any) {
      onShowToast(err.message || 'Không thể tải danh sách tài khoản', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) {
      setFormError('Vui lòng nhập đầy đủ tên tài khoản và mật khẩu.');
      return;
    }
    if (newPassword.length < 6) {
      setFormError('Mật khẩu tối thiểu phải có 6 ký tự.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const created = await createAdminUser(newUsername.trim(), newPassword, newRole);
      onShowToast(`Đã tạo thành công tài khoản "${created.username}" (${created.role})!`, 'success');
      setIsModalOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message || 'Lỗi khi tạo tài khoản');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (userToDelete: User) => {
    if (userToDelete.id === currentUser.id) {
      onShowToast('Bạn không thể tự xóa tài khoản của chính mình!', 'error');
      return;
    }

    const confirmed = window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${userToDelete.username}" và toàn bộ dữ liệu phát nhạc của họ?`);
    if (!confirmed) return;

    setDeletingUserId(userToDelete.id);
    try {
      await deleteAdminUser(userToDelete.id);
      onShowToast(`Đã xóa tài khoản "${userToDelete.username}" khỏi hệ thống.`, 'info');
      fetchUsers();
    } catch (err: any) {
      onShowToast(err.message || 'Lỗi khi xóa tài khoản', 'error');
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <div className="space-y-6 pb-28 animate-fade-in max-w-6xl mx-auto">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-indigo-950/60 via-purple-950/50 to-black/70 border border-white/12 backdrop-blur-2xl shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-3">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Hệ Thống Phân Quyền Quản Trị (RBAC)</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Quản Lý Tài Khoản Người Dùng
            </h2>
            <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed max-w-xl">
              Danh sách tài khoản lưu trữ bền vững trong file SQLite <code className="text-cyan-300">music_player.db</code>. 
              Chỉ Admin mới có quyền tạo thêm tài khoản và phân quyền cho người dùng.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchUsers}
              disabled={isLoading}
              className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 active:scale-95 transition-all"
              title="Làm mới danh sách"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>

            <button
              onClick={() => {
                setIsModalOpen(true);
                setFormError(null);
              }}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold bg-gradient-to-r from-indigo-500 via-purple-600 to-cyan-400 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-105 active:scale-95 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Thêm tài khoản mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* Users List Container */}
      <div className="glass-card rounded-3xl p-6 border border-white/10 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" />
            <span>Danh sách tài khoản trong cơ sở dữ liệu ({users.length})</span>
          </h3>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-zinc-400 text-xs flex flex-col items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-400 mb-2" />
            <span>Đang tải danh sách tài khoản...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-xs">
            Chưa có tài khoản người dùng nào.
          </div>
        ) : (
          <div className="divide-y divide-white/5 mt-2">
            {users.map((u) => {
              const isMe = u.id === currentUser.id;
              const isAdmin = u.role === 'admin';

              return (
                <div
                  key={u.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] px-3 rounded-2xl transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 border ${
                      isAdmin 
                        ? 'bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border-indigo-500/40 text-indigo-300' 
                        : 'bg-white/5 border-white/10 text-zinc-400'
                    }`}>
                      {isAdmin ? <ShieldCheck className="w-5 h-5 text-cyan-400" /> : <UserIcon className="w-5 h-5" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white truncate">
                          {u.username}
                        </span>
                        {isMe && (
                          <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            Bạn đang đăng nhập
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-400 mt-0.5">
                        <span className="flex items-center gap-1 text-zinc-500">
                          <Calendar className="w-3 h-3" />
                          <span>Tạo lúc: {u.createdAt || 'Mặc định'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    {/* Role Badge */}
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                      isAdmin
                        ? 'bg-gradient-to-r from-indigo-500/20 to-purple-600/20 text-indigo-300 border-indigo-500/40 shadow-sm shadow-indigo-500/20'
                        : 'bg-white/5 text-zinc-300 border-white/10'
                    }`}>
                      {isAdmin ? 'Quản trị viên (Admin)' : 'Người dùng (User)'}
                    </span>

                    {/* Delete Button */}
                    {!isMe && (
                      <button
                        onClick={() => handleDeleteUser(u)}
                        disabled={deletingUserId === u.id}
                        className="p-2 rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/15 transition-all active:scale-90"
                        title={`Xóa tài khoản ${u.username}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Add New User */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in">
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/15 bg-zinc-950/90">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                <span>Tạo tài khoản mới</span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4 mt-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Tên tài khoản (Username)
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="ví dụ: music_fan, dj_aura..."
                    className="w-full h-11 pl-10 pr-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                    disabled={isSubmitting}
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Mật khẩu (Tối thiểu 6 ký tự)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nhập mật khẩu an toàn..."
                    className="w-full h-11 pl-10 pr-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Vai trò (Role)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewRole('user')}
                    className={`h-11 rounded-2xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                      newRole === 'user'
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                        : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                    }`}
                  >
                    <UserIcon className="w-3.5 h-3.5" />
                    <span>User thường</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewRole('admin')}
                    className={`h-11 rounded-2xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                      newRole === 'admin'
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-purple-400 shadow-md shadow-purple-600/30'
                        : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Quản trị viên</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-white/10 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-500 via-purple-600 to-cyan-400 text-white shadow-lg shadow-indigo-500/30 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang tạo...' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
