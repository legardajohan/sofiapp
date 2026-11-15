import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import { puedeConfigurar } from '@/lib/roles';

/**
 * Guard de UI de la configuración de la empresa y de las campañas (AUTH-04, ADR 0017): solo el
 * Administrador. Va DENTRO de `RequireRole`. La UI oculta; quien decide es el backend
 * (`authorizeRolEmpresa(ROLES_CONFIGURACION)`).
 */
export function RequireConfiguracion({ children }: { children: React.ReactNode }): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  return puedeConfigurar(user) ? <>{children}</> : <Navigate to="/" replace />;
}
