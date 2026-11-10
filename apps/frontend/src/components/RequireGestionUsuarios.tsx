import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import { puedeGestionarUsuarios } from '@/lib/roles';

/**
 * Guard de UI de la gestión de usuarios (AUTH-03, ADR 0016). Va DENTRO de `RequireRole`: este solo
 * afina por subrol. La UI oculta; quien decide es el backend (`authorizeSubrol`).
 */
export function RequireGestionUsuarios({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  return puedeGestionarUsuarios(user) ? <>{children}</> : <Navigate to="/" replace />;
}
