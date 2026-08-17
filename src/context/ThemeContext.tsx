import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadState, saveState } from '@/lib/storage';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => loadState<ThemeMode>('theme-mode', () => 'system'));
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => (mode === 'dark' || (mode === 'system' && systemPrefersDark()) ? 'dark' : 'light'));

  useEffect(() => {
    function apply() {
      const next = mode === 'dark' || (mode === 'system' && systemPrefersDark()) ? 'dark' : 'light';
      setResolvedTheme(next);
      document.documentElement.setAttribute('data-theme', next);
    }
    apply();
    if (mode !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mode]);

  function setMode(next: ThemeMode) {
    setModeState(next);
    saveState('theme-mode', next);
  }

  return (
    <ThemeContext.Provider value={{ mode, resolvedTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
