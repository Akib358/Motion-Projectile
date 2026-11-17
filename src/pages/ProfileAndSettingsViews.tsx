import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, LogOut, RotateCcw, Volume2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { soundEngine } from '../lib/soundEngine';

const SCIENTIFIC_AVATARS: { id: string; label: string; url: string }[] = [
  {
    id: 'orbital',
    label: 'Orbital',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0ea5e9"/><stop offset="100%" stop-color="#22c55e"/></linearGradient></defs><rect width="120" height="120" rx="60" fill="url(#g)"/><circle cx="60" cy="60" r="15" fill="#fff"/><ellipse cx="60" cy="60" rx="44" ry="18" fill="none" stroke="#fff" stroke-width="4" transform="rotate(-28 60 60)"/><circle cx="94" cy="42" r="6" fill="#facc15"/></svg>`,
    )}`,
  },
  {
    id: 'rocket',
    label: 'Rocket',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#05070a"/><stop offset="100%" stop-color="#0284c7"/></linearGradient></defs><rect width="120" height="120" rx="60" fill="url(#g)"/><path d="M60 22 C74 38 76 62 72 78 L48 78 C44 62 46 38 60 22 Z" fill="#f8fafc"/><circle cx="60" cy="52" r="8" fill="#38bdf8"/><path d="M48 66 L36 82 L48 78 Z M72 66 L84 82 L72 78 Z" fill="#22c55e"/><path d="M52 78 L60 98 L68 78 Z" fill="#facc15"/></svg>`,
    )}`,
  },
  {
    id: 'trajectory',
    label: 'Ballistics',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#16a34a"/><stop offset="100%" stop-color="#0284c7"/></linearGradient></defs><rect width="120" height="120" rx="60" fill="url(#g)"/><path d="M22 86 Q60 14 96 84" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="6 5"/><circle cx="60" cy="48" r="10" fill="#facc15" stroke="#fff" stroke-width="3"/></svg>`,
    )}`,
  },
  {
    id: 'aero',
    label: 'Flight',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0284c7"/><stop offset="100%" stop-color="#38bdf8"/></linearGradient></defs><rect width="120" height="120" rx="60" fill="url(#g)"/><path d="M22 66 L96 42 L66 86 L56 68 Z" fill="#fff"/><path d="M56 68 L66 86 L48 76 Z" fill="#facc15"/></svg>`,
    )}`,
  },
];

export function ProfileView({ simulationCount }: { simulationCount: number }) {
  const { firebaseUser, profile, logout, updatePreferences } = useAuth();
  const [nameInput, setNameInput] = useState(
    profile?.displayName || firebaseUser?.displayName || '',
  );
  const [savedNotice, setSavedNotice] = useState(false);
  const [photoSavedNotice, setPhotoSavedNotice] = useState(false);

  useEffect(() => {
    if (profile?.displayName) {
      setNameInput(profile.displayName);
    } else if (firebaseUser?.displayName) {
      setNameInput(firebaseUser.displayName);
    }
  }, [profile?.displayName, firebaseUser?.displayName]);

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    await updatePreferences({ displayName: nameInput.trim() });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleSelectAvatar = async (nextUrl: string | null) => {
    await updatePreferences({ photoURL: nextUrl });
    setPhotoSavedNotice(true);
    setTimeout(() => setPhotoSavedNotice(false), 2000);
  };

  const currentAvatar = profile?.photoURL;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-2xl space-y-5"
    >
      <div className="glass-card rounded-2xl p-5 sm:p-7 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full p-0.5 bg-gradient-to-tr from-sky-400 via-emerald-400 to-yellow-400 shrink-0">
              {currentAvatar ? (
                <img
                  src={currentAvatar}
                  alt={profile?.displayName || 'Profile avatar'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full rounded-full object-cover bg-slate-950"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-slate-950 text-white flex items-center justify-center text-2xl font-bold">
                  {(profile?.displayName || 'R')[0].toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white truncate">
                {profile?.displayName || firebaseUser?.displayName || 'Researcher'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                {profile?.email || firebaseUser?.email || ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-500/35 hover:bg-red-500/10 rounded-xl cursor-pointer self-start sm:self-center"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-4 border-t border-sky-500/20 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-sky-500/20">
            <span className="text-slate-500 dark:text-slate-400 block">Member Since</span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-1 block">
              {profile?.createdAt
                ? new Date(profile.createdAt).toLocaleDateString()
                : firebaseUser?.metadata?.creationTime
                  ? new Date(firebaseUser.metadata.creationTime).toLocaleDateString()
                  : new Date().toLocaleDateString()}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-sky-500/20">
            <span className="text-slate-500 dark:text-slate-400 block">Saved Simulations</span>
            <span className="tabular-nums text-sky-600 dark:text-sky-400 font-bold text-base mt-0.5 block">
              {simulationCount}
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-sky-500/20 space-y-2.5">
          <label
            htmlFor="profile-display-name"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            Display Name
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              id="profile-display-name"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="flex-1 px-3.5 py-2 text-sm bg-white dark:bg-[#070a0f] border border-sky-500/30 rounded-xl text-slate-900 dark:text-white"
            />
            <button
              type="button"
              onClick={handleSaveName}
              className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950 rounded-xl cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              {savedNotice && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>{savedNotice ? 'Saved' : 'Update Name'}</span>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-sky-500/20 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Profile Avatar
            </span>
            <div className="flex items-center gap-3">
              {photoSavedNotice && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500">
                  <Check className="w-3.5 h-3.5" />
                  <span>Updated</span>
                </span>
              )}
              {firebaseUser?.photoURL && (
                <button
                  type="button"
                  onClick={() => handleSelectAvatar(firebaseUser.photoURL)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Use Google Photo</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {SCIENTIFIC_AVATARS.map((av) => {
              const active = currentAvatar === av.url;
              return (
                <button
                  key={av.id}
                  type="button"
                  onClick={() => handleSelectAvatar(av.url)}
                  className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 cursor-pointer transition-colors ${
                    active
                      ? 'border-sky-400 bg-sky-500/15'
                      : 'border-sky-500/20 bg-slate-50/70 dark:bg-[#070a0f] hover:border-sky-400/50'
                  }`}
                >
                  <img src={av.url} alt={av.label} className="w-10 h-10 rounded-full" />
                  <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    {av.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function SettingsView() {
  const { theme, audioEnabled, audioVolume, updatePreferences } = useAuth();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-2xl space-y-5"
    >
      <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-6">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          Interface &amp; Audio Preferences
        </h2>

        <div className="space-y-3">
          <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Color Theme
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xs">
            {(['dark', 'light'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => updatePreferences({ themePreference: t })}
                className={`py-2.5 px-4 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                  theme === t
                    ? 'border-sky-400 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {t === 'dark' ? 'Black (Dark)' : 'Daylight (Light)'}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-sky-500/20 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Sound Effects
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Synthesizes launch and impact sound effects in the browser.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updatePreferences({ audioEnabled: !audioEnabled })}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                audioEnabled
                  ? 'bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {audioEnabled ? 'Enabled' : 'Muted'}
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <label htmlFor="settings-volume" className="text-slate-500 dark:text-slate-400">
                Master Volume
              </label>
              <span className="font-medium tabular-nums">
                {Math.round(audioVolume * 100)}%
              </span>
            </div>
            <input
              id="settings-volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audioVolume}
              onChange={(e) => updatePreferences({ audioVolume: Number(e.target.value) })}
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(['ball', 'rocket'] as const).map((type) => (
              <button
                key={type}
                type="button"
                disabled={!audioEnabled}
                onClick={() => soundEngine.playLaunch(type)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-50 dark:bg-[#070a0f] border border-sky-500/25 rounded-lg disabled:opacity-40 capitalize cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Test {type}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
