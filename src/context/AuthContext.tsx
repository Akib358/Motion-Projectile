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
    let prefTheme: 'light' | 'dark' = 'dark';
    let prefAudio = true;
    let prefVol = 0.45;
    let displayName = user.displayName || user.email?.split('@')[0] || 'Researcher';
    let photoURL = user.photoURL || null;
    let createdAt = user.metadata?.creationTime || new Date().toISOString();

    // 1. Try sync with SQLite backend if reachable
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/users/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: user.email || '',
          displayName,
          photoURL,
        }),
      });

      if (res.ok) {
        const row = await res.json();
        if (row.theme_preference === 'light' || row.theme_preference === 'dark') {
          prefTheme = row.theme_preference;
        }
        if (typeof row.audio_enabled === 'boolean') {
          prefAudio = row.audio_enabled;
        }
        if (typeof row.audio_volume === 'number') {
          prefVol = row.audio_volume;
        }
        if (row.display_name) {
          displayName = String(row.display_name);
        }
        if (row.profile_image) {
          photoURL = String(row.profile_image);
        }
        if (row.created_at) {
          createdAt = String(row.created_at);
        }
      }
    } catch {
      // Backend not running (e.g. GitHub Pages static deploy) - continue
    }

    // 2. Sync to Firestore (always runs directly in browser)
    try {
      const firestoreData = await syncUserProfileToFirestore(user, {
        displayName,
        photoURL,
        themePreference: prefTheme,
        audioEnabled: prefAudio,
        audioVolume: prefVol,
      });
      if (firestoreData) {
        if (firestoreData.displayName) displayName = firestoreData.displayName;
        if (firestoreData.themePreference) prefTheme = firestoreData.themePreference;
        if (typeof firestoreData.audioEnabled === 'boolean') prefAudio = firestoreData.audioEnabled;
        if (typeof firestoreData.audioVolume === 'number') prefVol = firestoreData.audioVolume;
        if (firestoreData.createdAt) createdAt = firestoreData.createdAt;
      }
    } catch (err) {
      console.warn('Firestore profile sync fallback:', err);
    }

    // 3. Always set profile so ProfileView and AppShell have full user data
    setProfile({
      uid: user.uid,
      email: user.email || '',
      displayName,
      photoURL,
      themePreference: prefTheme,
      audioEnabled: prefAudio,
      audioVolume: prefVol,
      createdAt,
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
      if (!firebaseUser) return;
      const currentName = profile?.displayName || firebaseUser.displayName || 'Researcher';
      const currentPhoto = profile?.photoURL ?? firebaseUser.photoURL;

      const nextTheme = prefs.themePreference ?? theme;
      const nextAudio = prefs.audioEnabled ?? audioEnabled;
      const nextVol = prefs.audioVolume ?? audioVolume;
      const nextName = (prefs.displayName ?? currentName).trim().slice(0, 150) || currentName;
      const nextPhoto = prefs.photoURL !== undefined ? prefs.photoURL : currentPhoto;

      setTheme(nextTheme);
      setAudioEnabled(nextAudio);
      setAudioVolume(nextVol);
      setProfile((prev) => ({
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: nextName,
        photoURL: nextPhoto ?? null,
        themePreference: nextTheme,
        audioEnabled: nextAudio,
        audioVolume: nextVol,
        createdAt: prev?.createdAt || firebaseUser.metadata?.creationTime || new Date().toISOString(),
      }));

      // Update in Firestore
      try {
        await updateUserPreferencesInFirestore(firebaseUser, {
          displayName: nextName,
          photoURL: nextPhoto ?? null,
          themePreference: nextTheme,
          audioEnabled: nextAudio,
          audioVolume: Math.max(0, Math.min(1, nextVol)),
        });
      } catch (err) {
        console.warn('Firestore preference update warning:', err);
      }

      // Optionally update backend if running
      try {
        const token = await firebaseUser.getIdToken();
        await fetch('/api/users/preferences', {
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
        });
      } catch {
        // Backend not running on static hosts
      }
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
