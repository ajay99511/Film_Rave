'use client';

/**
 * Class-based light/dark theme. Tailwind's `dark:` variant is bound to the
 * `.dark` class on <html> (see globals.css `@variant dark`), so toggling this
 * context flips every `dark:` utility across the logged-in app at once. The
 * choice is persisted in localStorage; dark is the default (the product's
 * "Midnight Marquee" identity), matching the pre-theme behavior exactly.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'fr.theme';

interface ThemeCtx {
  theme: Theme;
  isDark: boolean;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function apply(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  // Hydrate from storage on mount; default stays 'dark' if unset.
  useEffect(() => {
    const saved =
      (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'dark';
    setThemeState(saved);
    apply(saved);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    apply(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
  }, []);

  const toggle = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [theme, setTheme],
  );

  return (
    <Ctx.Provider value={{ theme, isDark: theme === 'dark', toggle, setTheme }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
