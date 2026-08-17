import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadState, saveState, removeState } from '@/lib/storage';

interface Session {
  loggedIn: boolean;
  username: string;
  rememberMe: boolean;
  loginAt: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  username: string;
  login: (username: string, password: string, rememberMe: boolean) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEMO_USERNAME = 'admin';
const DEMO_PASSWORD = 'admin';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() =>
    loadState<Session | null>('session', () => null)
  );

  useEffect(() => {
    if (session) saveState('session', session);
  }, [session]);

  async function login(username: string, password: string, rememberMe: boolean) {
    await new Promise((r) => setTimeout(r, 700));
    if (username.trim().toLowerCase() === DEMO_USERNAME && password === DEMO_PASSWORD) {
      const s: Session = { loggedIn: true, username, rememberMe, loginAt: new Date().toISOString() };
      setSession(s);
      saveState('session', s);
      return { ok: true };
    }
    return { ok: false, error: 'Invalid username or password. Please try the demo credentials (admin / admin).' };
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
        login,
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
