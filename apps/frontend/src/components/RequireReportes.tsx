import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import { puedeVerReportes } from '@/lib/roles';

/**
 * Guard de UI de los reportes del equipo (HU-REP-01, ADR 0011/0017). Va DENTRO de `RequireRole`: este
 * solo afina por rol de empresa. La UI oculta; quien decide es el backend (`authorizeRolEmpresa`).
 */
export function RequireReportes({ children }: { children: React.ReactNode }): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  return puedeVerReportes(user) ? <>{children}</> : <Navigate to="/" replace />;
}
