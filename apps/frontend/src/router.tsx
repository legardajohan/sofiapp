import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore.js';

const ChannelConfigPage = lazy(() =>
  import('./features/channels/index.js').then((m) => ({ default: m.ChannelConfigPage })),
);

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.rol)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: '/settings/channels/whatsapp',
    element: (
      <RequireRole roles={['admin']}>
        <Suspense fallback={<div className="p-8 text-sm text-gray-500">Cargando...</div>}>
          <ChannelConfigPage />
        </Suspense>
      </RequireRole>
    ),
  },
  {
    path: '*',
    element: <div className="p-8 text-sm text-gray-500">Página no encontrada</div>,
  },
]);
