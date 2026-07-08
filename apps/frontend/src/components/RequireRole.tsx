import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import { RequireAuth } from './RequireAuth.js';

export function RequireRole({
  roles,
  children,
}: {
  roles: string[];
  children: React.ReactNode;
}): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  return (
    <RequireAuth>{user && roles.includes(user.rol) ? children : <Navigate to="/" replace />}</RequireAuth>
  );
}
