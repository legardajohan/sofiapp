import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import { puedeVerReportes } from '@/lib/roles';

/**
 * Guard de UI de los reportes del equipo (HU-REP-01, ADR 0011). Va DENTRO de `RequireRole`: este
 * solo afina por subrol. La UI oculta; quien decide es el backend (`authorizeSubrol`).
 */
export function RequireReportes({ children }: { children: React.ReactNode }): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  return puedeVerReportes(user) ? <>{children}</> : <Navigate to="/" replace />;
}
