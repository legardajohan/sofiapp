import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { RequireRole } from './components/RequireRole.js';

const ChannelConfigPage = lazy(() =>
  import('./features/channels/index.js').then((m) => ({ default: m.ChannelConfigPage })),
);

const AdminRoutes = lazy(() =>
  import('./routes/AdminRoutes.js').then((m) => ({ default: m.default })),
);

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
    path: '/admin/*',
    element: (
      <Suspense fallback={<div className="p-8 text-sm text-gray-500">Cargando...</div>}>
        <AdminRoutes />
      </Suspense>
    ),
  },
  {
    path: '*',
    element: <div className="p-8 text-sm text-gray-500">Página no encontrada</div>,
  },
]);
