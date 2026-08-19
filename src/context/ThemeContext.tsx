import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { loadState, saveState } from '@/lib/storage';

export type ThemeMode = 'light' | 'dark' | 'system' | 'custom';
export type AccentThemeId =
  | 'beneco'
  | 'emerald'
  | 'blue'
  | 'sky'
  | 'cyan'
  | 'teal'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'pink'
  | 'rose'
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'slate'
  | 'zinc'
  | 'stone';

interface AccentTheme {
  id: AccentThemeId;
  name: string;
  swatch: string;
  light: Record<string, string>;
  dark: Record<string, string>;
}

interface ThemeUserSettings {
  mode?: ThemeMode;
  accentTheme?: AccentThemeId;
}

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  accentTheme: AccentThemeId;
  accentThemes: AccentTheme[];
  setMode: (mode: ThemeMode) => void;
  setAccentTheme: (theme: AccentThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ACCENT_THEMES: AccentTheme[] = [
  makeTheme('beneco', 'BENECO Green', '#16a34a', ['#ecfdf5', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#0f8b4c', '#0b6b3a', '#085229', '#04331a']),
  makeTheme('emerald', 'Emerald', '#059669', ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#022c22']),
  makeTheme('blue', 'Blue', '#2563eb', ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554']),
  makeTheme('sky', 'Sky', '#0284c7', ['#f0f9ff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e', '#082f49']),
  makeTheme('cyan', 'Cyan', '#0891b2', ['#ecfeff', '#cffafe', '#a5f3fc', '#67e8f9', '#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63', '#083344']),
  makeTheme('teal', 'Teal', '#0d9488', ['#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a', '#042f2e']),
  makeTheme('indigo', 'Indigo', '#4f46e5', ['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81', '#1e1b4b']),
  makeTheme('violet', 'Violet', '#7c3aed', ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#2e1065']),
  makeTheme('purple', 'Purple', '#9333ea', ['#faf5ff', '#f3e8ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea', '#7e22ce', '#6b21a8', '#581c87', '#3b0764']),
  makeTheme('fuchsia', 'Fuchsia', '#c026d3', ['#fdf4ff', '#fae8ff', '#f5d0fe', '#f0abfc', '#e879f9', '#d946ef', '#c026d3', '#a21caf', '#86198f', '#701a75', '#4a044e']),
  makeTheme('pink', 'Pink', '#db2777', ['#fdf2f8', '#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d', '#9d174d', '#831843', '#500724']),
  makeTheme('rose', 'Rose', '#e11d48', ['#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337', '#4c0519']),
  makeTheme('red', 'Red', '#dc2626', ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#450a0a']),
  makeTheme('orange', 'Orange', '#ea580c', ['#fff7ed', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#431407']),
  makeTheme('amber', 'Amber', '#d97706', ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#451a03']),
  makeTheme('yellow', 'Yellow', '#ca8a04', ['#fefce8', '#fef9c3', '#fef08a', '#fde047', '#facc15', '#eab308', '#ca8a04', '#a16207', '#854d0e', '#713f12', '#422006']),
  makeTheme('lime', 'Lime', '#65a30d', ['#f7fee7', '#ecfccb', '#d9f99d', '#bef264', '#a3e635', '#84cc16', '#65a30d', '#4d7c0f', '#3f6212', '#365314', '#1a2e05']),
  makeTheme('slate', 'Slate', '#475569', ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#020617']),
  makeTheme('zinc', 'Zinc', '#52525b', ['#fafafa', '#f4f4f5', '#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46', '#27272a', '#18181b', '#09090b']),
  makeTheme('stone', 'Stone', '#57534e', ['#fafaf9', '#f5f5f4', '#e7e5e4', '#d6d3d1', '#a8a29e', '#78716c', '#57534e', '#44403c', '#292524', '#1c1917', '#0c0a09']),
];

function makeTheme(id: AccentThemeId, name: string, swatch: string, ramp: string[]): AccentTheme {
  return {
    id,
    name,
    swatch,
    light: makeLightVars(ramp),
    dark: makeDarkVars(ramp),
  };
}

function makeLightVars(ramp: string[]) {
  return {
    '--color-brand-50': ramp[0],
    '--color-brand-100': ramp[1],
    '--color-brand-200': ramp[2],
    '--color-brand-300': ramp[3],
    '--color-brand-400': ramp[4],
    '--color-brand-500': ramp[5],
    '--color-brand-600': ramp[6],
    '--color-brand-700': ramp[7],
    '--color-brand-800': ramp[8],
    '--color-brand-900': ramp[9],
    '--color-brand-950': ramp[10],
    '--color-onlight-accent': ramp[7],
    '--color-sidebar': ramp[9],
    '--color-status-pending': ramp[6],
  };
}

function makeDarkVars(ramp: string[]) {
  return {
    '--color-brand-50': ramp[10],
    '--color-brand-100': ramp[9],
    '--color-brand-200': ramp[8],
    '--color-brand-300': ramp[7],
    '--color-brand-400': ramp[6],
    '--color-brand-500': ramp[5],
    '--color-brand-600': ramp[5],
    '--color-brand-700': ramp[3],
    '--color-brand-800': ramp[2],
    '--color-brand-900': ramp[1],
    '--color-brand-950': ramp[0],
    '--color-onlight-accent': ramp[4],
    '--color-sidebar': ramp[10],
    '--color-status-pending': ramp[5],
  };
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function themeSettingsKey(username: string) {
  return `theme-settings:${username || 'anonymous'}`;
}

function safeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' || value === 'custom' ? value : 'system';
}

function safeAccentTheme(value: unknown): AccentThemeId {
  return ACCENT_THEMES.some((theme) => theme.id === value) ? value as AccentThemeId : 'beneco';
}

function loadThemeSettings(username: string): Required<ThemeUserSettings> {
  const legacyMode = loadState<ThemeMode>('theme-mode', () => 'system');
  const settings = loadState<ThemeUserSettings>(themeSettingsKey(username), () => ({ mode: legacyMode, accentTheme: 'beneco' }));
  return {
    mode: safeMode(settings.mode),
    accentTheme: safeAccentTheme(settings.accentTheme),
  };
}

function applyAccentTheme(accentTheme: AccentThemeId, resolvedTheme: 'light' | 'dark') {
  const theme = ACCENT_THEMES.find((item) => item.id === accentTheme) ?? ACCENT_THEMES[0];
  const vars = resolvedTheme === 'dark' ? theme.dark : theme.light;
  Object.entries(vars).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
  document.documentElement.setAttribute('data-accent-theme', theme.id);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { username } = useAuth();
  const initialSettings = loadThemeSettings(username);
  const [mode, setModeState] = useState<ThemeMode>(initialSettings.mode);
  const [accentTheme, setAccentThemeState] = useState<AccentThemeId>(initialSettings.accentTheme);
  const [settingsOwner, setSettingsOwner] = useState(username);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => (initialSettings.mode === 'dark' || (initialSettings.mode === 'system' && systemPrefersDark()) ? 'dark' : 'light'));

  useEffect(() => {
    const next = loadThemeSettings(username);
    setModeState(next.mode);
    setAccentThemeState(next.accentTheme);
    setSettingsOwner(username);
  }, [username]);

  useEffect(() => {
    function apply() {
      const next = mode === 'dark' || ((mode === 'system' || mode === 'custom') && systemPrefersDark()) ? 'dark' : 'light';
      setResolvedTheme(next);
      document.documentElement.setAttribute('data-theme', next);
      applyAccentTheme(mode === 'custom' ? accentTheme : 'beneco', next);
    }
    apply();
    if (mode !== 'system' && mode !== 'custom') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [accentTheme, mode]);

  useEffect(() => {
    if (settingsOwner !== username) return;
    saveState<ThemeUserSettings>(themeSettingsKey(username), { mode, accentTheme });
  }, [accentTheme, mode, settingsOwner, username]);

  function setMode(next: ThemeMode) {
    setModeState(next);
  }

  function setAccentTheme(next: AccentThemeId) {
    setAccentThemeState(next);
  }

  return (
    <ThemeContext.Provider value={{ mode, resolvedTheme, accentTheme, accentThemes: ACCENT_THEMES, setMode, setAccentTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
