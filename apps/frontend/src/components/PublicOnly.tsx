import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';

export function PublicOnly({ children }: { children: React.ReactNode }): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  if (user) return <Navigate to={user.rol === 'superadmin' ? '/admin' : '/'} replace />;
  return <>{children}</>;
}
