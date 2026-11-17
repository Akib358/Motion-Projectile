import { ReactNode, useState } from 'react';
import { motion } from 'motion/react';
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  History,
  Home,
  LogOut,
  Menu,
  Moon,
  PlayCircle,
  Settings,
  Sun,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AppPage } from '../types/simulation';
import { AppLogo } from './AppLogo';

interface AppShellProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  children: ReactNode;
}

const NAV_ITEMS: { id: AppPage; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'new-simulation', label: 'Simulator', icon: PlayCircle },
  { id: 'history', label: 'History', icon: History },
  { id: 'analytics', label: 'Analysis', icon: BarChart3 },
  { id: 'learn-rk4', label: 'Learn', icon: BookOpen },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function AppShell({ activePage, onNavigate, children }: AppShellProps) {
  const { profile, theme, audioEnabled, updatePreferences, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const activeMeta = NAV_ITEMS.find((i) => i.id === activePage) ?? NAV_ITEMS[0];

  const handleNav = (id: AppPage) => {
    onNavigate(id);
    setMobileOpen(false);
    setDropdownOpen(false);
  };

  return (
    <div className="min-h-screen flex lab-grid-surface text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* Desktop Minimal Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 border-r border-sky-500/20 bg-white/90 dark:bg-[#080b10]/95 backdrop-blur-xl transition-colors duration-300">
        <div className="h-14 px-5 border-b border-sky-500/20 flex items-center gap-2.5">
          <motion.div
            whileHover={{ rotate: 8, scale: 1.06 }}
            transition={{ duration: 0.3 }}
            className="w-8 h-8 rounded-lg bg-white border border-sky-400/40 flex items-center justify-center shrink-0 shadow-xs overflow-hidden p-0.5"
          >
            <AppLogo className="w-full h-full" size={28} />
          </motion.div>
          <span className="font-display font-bold tracking-tight text-sm text-slate-900 dark:text-white whitespace-nowrap">
            PROJECTILE LAB
          </span>
        </div>

        <nav aria-label="Primary sidebar navigation" className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <motion.button
                key={item.id}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => handleNav(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative w-full min-h-[40px] px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'text-sky-700 dark:text-sky-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-sky-500/10 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="sidebarActivePill"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-sky-500/15 to-emerald-500/15 border border-sky-400/40"
                  />
                )}
                <Icon className="w-4 h-4 shrink-0 relative z-10" aria-hidden="true" />
                <span className="relative z-10">{item.label}</span>
              </motion.button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sky-500/20 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {profile?.photoURL ? (
            <img
              src={profile.photoURL}
              alt={profile.displayName}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-sky-400/40 shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-emerald-400 text-slate-950 flex items-center justify-center text-xs font-bold shrink-0">
              {(profile?.displayName || 'R')[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">
              {profile?.displayName}
            </div>
            <div className="truncate mt-0.5">{profile?.email}</div>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (Compact <= 56px for mobile + PC) */}
        <header className="sticky top-0 z-30 h-14 px-3 sm:px-6 border-b border-sky-500/20 bg-white/90 dark:bg-[#080b10]/92 backdrop-blur-xl flex items-center justify-between gap-3 transition-colors duration-300">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
              className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-sky-500/25 text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>

            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-sky-600 dark:text-sky-400 font-semibold hidden sm:inline whitespace-nowrap">
                PROJECTILE LAB
              </span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-slate-900 dark:text-white truncate">
                {activeMeta.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => updatePreferences({ audioEnabled: !audioEnabled })}
              aria-label={audioEnabled ? 'Mute sound effects' : 'Unmute sound effects'}
              title={audioEnabled ? 'Mute sound effects' : 'Unmute sound effects'}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-sky-500/25 text-slate-700 dark:text-sky-300 hover:bg-sky-500/10 transition-colors cursor-pointer"
            >
              {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() =>
                updatePreferences({ themePreference: theme === 'dark' ? 'light' : 'dark' })
              }
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-yellow-500/35 text-amber-600 dark:text-yellow-300 hover:bg-yellow-500/10 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </motion.button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                aria-expanded={dropdownOpen}
                className="inline-flex items-center gap-2 h-9 pl-1.5 pr-2 rounded-lg border border-sky-500/25 hover:bg-sky-500/10 text-xs font-medium transition-colors cursor-pointer"
              >
                {profile?.photoURL ? (
                  <img
                    src={profile.photoURL}
                    alt={profile.displayName}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-sky-400 to-emerald-400 text-slate-950 flex items-center justify-center text-[11px] font-bold">
                    {(profile?.displayName || 'R')[0].toUpperCase()}
                  </div>
                )}
                <span className="hidden sm:inline max-w-[110px] truncate">
                  {profile?.displayName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-44 glass-card rounded-xl shadow-lg p-1.5 z-50">
                  <button
                    type="button"
                    onClick={() => handleNav('profile')}
                    className="w-full px-3 py-2 text-left text-xs rounded-md hover:bg-sky-500/10 flex items-center gap-2 cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNav('settings')}
                    className="w-full px-3 py-2 text-left text-xs rounded-md hover:bg-sky-500/10 flex items-center gap-2 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Settings</span>
                  </button>
                  <div className="my-1 border-t border-sky-500/20" />
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full px-3 py-2 text-left text-xs text-red-600 dark:text-red-400 rounded-md hover:bg-red-500/10 flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileOpen && (
          <div className="lg:hidden border-b border-sky-500/20 bg-white/95 dark:bg-[#080b10]/95 backdrop-blur-xl p-2.5 grid grid-cols-2 gap-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNav(item.id)}
                  className={`min-h-[42px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2.5 cursor-pointer ${
                    active
                      ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-400/40'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-sky-500/10'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <main className="flex-1 p-3 sm:p-5 lg:p-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
