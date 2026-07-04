import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore.js';

export function RequireRole({
  roles,
  children,
}: {
  roles: string[];
  children: React.ReactNode;
}): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.rol)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
