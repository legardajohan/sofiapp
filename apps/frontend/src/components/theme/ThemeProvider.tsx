import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeProviderState {
  theme: Theme;
  /**
   * Tema realmente aplicado: `theme` con `'system'` ya resuelto. Lo necesita cualquier código que
   * calcule colores en JS (p. ej. los chips de etiqueta, cuyo color viene de la base de datos y
   * debe ajustarse para mantener el contraste). Sin esto, cada consumidor tendría que mirar la
   * clase del `<html>` por su cuenta.
   */
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const initialState: ThemeProviderState = {
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => undefined,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

function resolveSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'sofiapp-theme',
}: ThemeProviderProps): React.ReactElement {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme | null) ?? defaultTheme,
  );
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    theme === 'system' ? resolveSystemTheme() : theme,
  );

  useEffect(() => {
    const resuelto = theme === 'system' ? resolveSystemTheme() : theme;
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resuelto);
    setResolvedTheme(resuelto);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      const resuelto = resolveSystemTheme();
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(resuelto);
      setResolvedTheme(resuelto);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = (next: Theme): void => {
    localStorage.setItem(storageKey, next);
    setThemeState(next);
  };

  return (
    <ThemeProviderContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme(): ThemeProviderState {
  return useContext(ThemeProviderContext);
}
