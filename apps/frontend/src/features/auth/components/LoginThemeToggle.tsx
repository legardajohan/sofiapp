import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';

/**
 * Alterna light↔dark desde el login. Escribe en el mismo `useTheme()` que persiste la
 * preferencia en localStorage (`sofiapp-theme`), así la elección hecha aquí se conserva
 * en la app y en el próximo inicio de sesión. Un tema `system` se resuelve al valor real
 * solo para decidir el icono; el clic siempre fija un tema explícito.
 */
function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function LoginThemeToggle(): React.ReactElement {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark());

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="relative h-9 w-9 text-muted-foreground transition-transform hover:text-foreground active:scale-95"
    >
      <Sun className="h-[1.15rem] w-[1.15rem] rotate-0 scale-100 transition-transform duration-300 ease-out dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.15rem] w-[1.15rem] rotate-90 scale-0 transition-transform duration-300 ease-out dark:rotate-0 dark:scale-100" />
      <span className="sr-only">{isDark ? 'Modo claro' : 'Modo oscuro'}</span>
    </Button>
  );
}
