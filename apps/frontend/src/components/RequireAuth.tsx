import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';

export function RequireAuth({ children }: { children: React.ReactNode }): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
