import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { soundEngine } from '../lib/soundEngine';
import {
  syncUserProfileToFirestore,
  updateUserPreferencesInFirestore,
} from '../services/firestoreSyncService';
import { UserProfile } from '../types/simulation';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  authBusy: boolean;
  authError: string | null;
  theme: 'dark' | 'light';
  audioEnabled: boolean;
  audioVolume: number;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string>;
  updatePreferences: (prefs: {
    themePreference?: 'dark' | 'light';
    audioEnabled?: boolean;
    audioVolume?: number;
    displayName?: string;
    photoURL?: string | null;
  }) => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioVolume, setAudioVolume] = useState(0.45);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    soundEngine.setSettings(audioEnabled, audioVolume);
  }, [audioEnabled, audioVolume]);

  const syncUserProfile = useCallback(async (user: FirebaseUser) => {
    const token = await user.getIdToken();
    const res = await fetch('/api/users/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || 'Researcher',
        photoURL: user.photoURL || null,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'SQLite profile sync failed.' }));
      throw new Error(err.error || 'Unable to synchronize user profile.');
    }

    const row = await res.json();
    const prefTheme: 'light' | 'dark' = row.theme_preference === 'dark' ? 'dark' : 'light';
    const prefAudio = Boolean(row.audio_enabled ?? true);
    const prefVol = typeof row.audio_volume === 'number' ? row.audio_volume : 0.45;
    const displayName = String(row.display_name ?? user.displayName ?? 'Researcher');
    const photoURL = (row.profile_image as string | undefined) ?? user.photoURL;

    await syncUserProfileToFirestore(user, {
      displayName,
      photoURL,
      themePreference: prefTheme,
      audioEnabled: prefAudio,
      audioVolume: prefVol,
    });

    setProfile({
      uid: user.uid,
      email: String(row.email ?? user.email ?? ''),
      displayName,
      photoURL,
      themePreference: prefTheme,
      audioEnabled: prefAudio,
      audioVolume: prefVol,
      createdAt: String(row.created_at ?? new Date().toISOString()),
    });
    setTheme(prefTheme);
    setAudioEnabled(prefAudio);
    setAudioVolume(prefVol);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          await syncUserProfile(user);
        } catch (error) {
          setAuthError(
            error instanceof Error ? error.message : 'Unable to synchronize user profile.',
          );
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [syncUserProfile]);

  const signInWithGoogle = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Google sign-in popup was closed before completion.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('Popup was blocked by the browser. Please allow popups for this site.');
      } else {
        setAuthError(error instanceof Error ? error.message : 'Google authentication failed.');
      }
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthBusy(true);
    soundEngine.stopFlightLoop();
    try {
      await signOut(auth);
      setProfile(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to sign out.');
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const getIdToken = useCallback(async () => {
    if (!auth.currentUser) {
      throw new Error('Authentication required.');
    }
    return auth.currentUser.getIdToken();
  }, []);

  const updatePreferences = useCallback(
    async (prefs: {
      themePreference?: 'dark' | 'light';
      audioEnabled?: boolean;
      audioVolume?: number;
      displayName?: string;
      photoURL?: string | null;
    }) => {
      if (!firebaseUser || !profile) return;
      const nextTheme = prefs.themePreference ?? theme;
      const nextAudio = prefs.audioEnabled ?? audioEnabled;
      const nextVol = prefs.audioVolume ?? audioVolume;
      const nextName =
        (prefs.displayName ?? profile.displayName).trim().slice(0, 150) || profile.displayName;
      const nextPhoto = prefs.photoURL !== undefined ? prefs.photoURL : profile.photoURL;

      setTheme(nextTheme);
      setAudioEnabled(nextAudio);
      setAudioVolume(nextVol);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              displayName: nextName,
              photoURL: nextPhoto ?? null,
              themePreference: nextTheme,
              audioEnabled: nextAudio,
              audioVolume: nextVol,
            }
          : null,
      );

      const token = await firebaseUser.getIdToken();
      await Promise.all([
        fetch('/api/users/preferences', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            displayName: nextName,
            photoURL: nextPhoto ?? null,
            themePreference: nextTheme,
            audioEnabled: nextAudio,
            audioVolume: Math.max(0, Math.min(1, nextVol)),
          }),
        }),
        updateUserPreferencesInFirestore(firebaseUser, {
          displayName: nextName,
          photoURL: nextPhoto ?? null,
          themePreference: nextTheme,
          audioEnabled: nextAudio,
          audioVolume: Math.max(0, Math.min(1, nextVol)),
        }),
      ]);
    },
    [firebaseUser, profile, theme, audioEnabled, audioVolume],
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        authBusy,
        authError,
        theme,
        audioEnabled,
        audioVolume,
        signInWithGoogle,
        logout,
        getIdToken,
        updatePreferences,
        clearAuthError: () => setAuthError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return ctx;
}
