import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './stores/authStore.js';
import { fetchMe } from './features/auth/api.js';
import { LoginPage } from './features/auth/LoginPage.js';

const ChannelConfigPage = lazy(() =>
  import('./features/channels/index.js').then((m) => ({ default: m.ChannelConfigPage })),
);

function Loading(): React.ReactElement {
  return <div className="p-8 text-sm text-gray-500">Cargando...</div>;
}

function AuthBootstrap(): React.ReactElement {
  const status = useAuthStore((s) => s.status);
  const setUser = useAuthStore((s) => s.setUser);
  const setStatus = useAuthStore((s) => s.setStatus);

  useEffect(() => {
    if (status !== 'idle') return;
    setStatus('loading');
    fetchMe()
      .then((session) => setUser({ sub: session.sub, rol: session.rol, nombre: session.nombre }))
      .catch(() => setStatus('unauthenticated'));
  }, [status, setStatus, setUser]);

  if (status === 'idle' || status === 'loading') return <Loading />;
  return <Outlet />;
}

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.rol)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  if (user) return <Navigate to={user.rol === 'superadmin' ? '/admin' : '/'} replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    element: <AuthBootstrap />,
    children: [
      {
        path: '/login',
        element: (
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        ),
      },
      {
        path: '/settings/channels/whatsapp',
        element: (
          <RequireRole roles={['admin']}>
            <Suspense fallback={<Loading />}>
              <ChannelConfigPage />
            </Suspense>
          </RequireRole>
        ),
      },
      {
        path: '*',
        element: <div className="p-8 text-sm text-gray-500">Página no encontrada</div>,
      },
    ],
  },
]);
