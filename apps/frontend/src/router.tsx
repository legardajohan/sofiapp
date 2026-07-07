import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage.js';
import { LoginView } from './features/auth/index.js';
import { RequireRole } from './components/RequireRole.js';
import { AuthBootstrap } from './components/AuthBootstrap.js';
import { PublicOnly } from './components/PublicOnly.js';
import { Loading } from './components/Loading.js';

const ChannelConfigPage = lazy(() =>
  import('./features/channels/index.js').then((m) => ({ default: m.ChannelConfigPage })),
);

const AdminRoutes = lazy(() =>
  import('./routes/AdminRoutes.js').then((m) => ({ default: m.default })),
);

export const router = createBrowserRouter([
  {
    element: (
      <>
        <LoginView />
        <AuthBootstrap />
      </>
    ),
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
        path: '/admin/*',
        element: (
          <Suspense fallback={<Loading />}>
            <AdminRoutes />
          </Suspense>
        ),
      },
      {
        path: '*',
        element: <div className="p-8 text-sm text-gray-500">Página no encontrada</div>,
      },
    ],
  },
]);
