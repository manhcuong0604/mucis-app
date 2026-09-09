import React from 'react';
import { Radio, Compass, Users, Heart, Sparkles, ShieldCheck } from 'lucide-react';
import { ViewMode } from '../types';

interface NavigationPillProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  radarBadgeCount?: number;
  isAdmin?: boolean;
}

export const NavigationPill: React.FC<NavigationPillProps> = ({
  currentView,
  onViewChange,
  radarBadgeCount = 0,
  isAdmin = false
}) => {
  const navItems = [
    {
      id: 'radar' as ViewMode,
      label: 'Radar Mới',
      icon: Radio,
      badge: radarBadgeCount > 0 ? radarBadgeCount : null
    },
    {
      id: 'ai-recommend' as ViewMode,
      label: 'AI Vibe',
      icon: Sparkles
    },
    {
      id: 'discover' as ViewMode,
      label: 'Khám phá',
      icon: Compass
    },
    {
      id: 'artists' as ViewMode,
      label: 'Nghệ sĩ',
      icon: Users
    },
    {
      id: 'library' as ViewMode,
      label: 'Thư viện',
      icon: Heart
    },
    ...(isAdmin ? [{
      id: 'admin-users' as ViewMode,
      label: 'Quản lý tài khoản',
      icon: ShieldCheck
    }] : [])
  ];

  return (
    <nav className="inline-flex items-center p-1.5 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/40">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentView === item.id;

        return (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300 ${
              isActive
                ? 'text-white bg-gradient-to-r from-indigo-500/80 via-purple-600/80 to-indigo-600/80 shadow-lg shadow-indigo-500/25 border border-white/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white animate-pulse' : 'text-zinc-400'}`} />
            <span>{item.label}</span>

            {item.badge && (
              <span className="flex items-center justify-center px-1.5 py-0.2 min-w-4 h-4 text-[10px] font-bold rounded-full bg-cyan-500 text-black shadow-sm shadow-cyan-500/50">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
