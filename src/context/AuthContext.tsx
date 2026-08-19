import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadState, saveState, removeState } from '@/lib/storage';
import { apiRequest, updateProfileDetails, updateProfilePhoto, type ApiUser, type ProfileDetailsInput } from '@/lib/api';

interface Session {
  loggedIn: boolean;
  username: string;
  rememberMe: boolean;
  loginAt: string;
  token: string;
  user: ApiUser;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  username: string;
  user: ApiUser | null;
  token: string;
  login: (username: string, password: string, rememberMe: boolean) => Promise<{ ok: boolean; error?: string }>;
  refreshUser: () => Promise<void>;
  saveProfileDetails: (profile: ProfileDetailsInput) => Promise<{ ok: boolean; error?: string }>;
  saveProfilePhoto: (profilePhoto: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() =>
    loadState<Session | null>('session', () => null)
  );

  useEffect(() => {
    if (session) saveState('session', session);
  }, [session]);

  useEffect(() => {
    if (!session?.token) return;
    let cancelled = false;
    refreshUser().then(() => undefined)
      .catch(() => {
        if (!cancelled) logout();
      });
    return () => { cancelled = true; };
  }, [session?.token]);

  async function login(username: string, password: string, rememberMe: boolean) {
    try {
      const result = await apiRequest<{ token: string; user: ApiUser }>('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ username, password, rememberMe }),
      });
      const s: Session = { loggedIn: true, username: result.user.username, rememberMe, loginAt: new Date().toISOString(), token: result.token, user: result.user };
      setSession(s);
      saveState('session', s);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unable to sign in.' };
    }
  }

  async function refreshUser() {
    if (!session?.token) return;
    const result = await apiRequest<{ user: ApiUser }>('/api/auth/me', {
      headers: { authorization: `Bearer ${session.token}` },
    });
    setSession((current) => current ? { ...current, username: result.user.username, user: result.user } : current);
  }

  async function saveProfilePhoto(profilePhoto: string) {
    if (!session?.token) return { ok: false, error: 'You must be signed in to update your profile photo.' };
    try {
      const result = await updateProfilePhoto(session.token, profilePhoto);
      setSession((current) => current ? { ...current, user: result.user, username: result.user.username } : current);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unable to update profile photo.' };
    }
  }

  async function saveProfileDetails(profile: ProfileDetailsInput) {
    if (!session?.token) return { ok: false, error: 'You must be signed in to update your profile.' };
    try {
      const result = await updateProfileDetails(session.token, profile);
      setSession((current) => current ? { ...current, user: result.user, username: result.user.username } : current);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unable to update your profile.' };
    }
  }

  function logout() {
    setSession(null);
    removeState('session');
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!session?.loggedIn,
        username: session?.username ?? '',
        user: session?.user ?? null,
        token: session?.token ?? '',
        login,
        refreshUser,
        saveProfileDetails,
        saveProfilePhoto,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
