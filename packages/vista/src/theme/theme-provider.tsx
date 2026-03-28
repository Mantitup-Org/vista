'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'vista-theme';
const THEME_ORDER: ThemeMode[] = ['system', 'light', 'dark'];
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  cycleTheme: () => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function sanitizeTheme(value: string | null | undefined, fallback: ThemeMode): ThemeMode {
  if (value === 'system' || value === 'light' || value === 'dark') {
    return value;
  }
  return fallback;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'dark';
  }
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
}

function resolveTheme(theme: ThemeMode): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme;
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') {
    return;
  }

  const resolvedTheme = resolveTheme(theme);
  const root = document.documentElement;

  root.classList.remove('light', 'dark');
  root.classList.add(resolvedTheme);
  root.dataset.theme = theme;
  root.style.colorScheme = resolvedTheme;
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: ThemeMode;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(defaultTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const nextTheme = sanitizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY), defaultTheme);
    setThemeState(nextTheme);
    applyTheme(nextTheme);
    setMounted(true);
  }, [defaultTheme]);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyTheme(theme);
  }, [mounted, theme]);

  useEffect(() => {
    if (!mounted) return;

    const media = window.matchMedia(MEDIA_QUERY);

    const handleMediaChange = () => {
      const currentTheme = sanitizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY), defaultTheme);
      if (currentTheme === 'system') {
        applyTheme('system');
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const nextTheme = sanitizeTheme(event.newValue, defaultTheme);
      setThemeState(nextTheme);
      applyTheme(nextTheme);
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleMediaChange);
    } else {
      media.addListener(handleMediaChange);
    }

    window.addEventListener('storage', handleStorage);

    return () => {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', handleMediaChange);
      } else {
        media.removeListener(handleMediaChange);
      }
      window.removeEventListener('storage', handleStorage);
    };
  }, [defaultTheme, mounted]);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((currentTheme) => {
      const index = THEME_ORDER.indexOf(currentTheme);
      return THEME_ORDER[(index + 1) % THEME_ORDER.length];
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme: resolveTheme(theme),
      setTheme,
      cycleTheme,
      mounted,
    }),
    [cycleTheme, mounted, setTheme, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider.');
  }
  return context;
}
