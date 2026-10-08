import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import { AdminTenantsPage } from '../features/admin-tenants/pages/AdminTenantsPage.js';
import { AdminPlansPage } from '../features/admin-plans/pages/AdminPlansPage.js';
import { Loading } from '../components/Loading.js';

// Diferida: arrastra recharts, que Empresas y Planes no necesitan descargar (HU-SAAS-03).
const AdminMetricsPage = lazy(() =>
  import('../features/admin-metrics/pages/AdminMetricsPage.js').then((m) => ({ default: m.AdminMetricsPage })),
);

export default function AdminRoutes() {
  const user = useAuthStore((s) => s.user);

  if (!user || user.rol !== 'superadmin') {
    return <Navigate to="/" replace />;
  }

  // La navegación entre Empresas y Planes vive únicamente en el menú lateral (grupo "Superadmin"
  // de nav-config); ya no se duplica en una barra superior (HU-SAAS-02).
  return (
    <Routes>
      <Route path="tenants" element={<AdminTenantsPage />} />
      <Route path="plans" element={<AdminPlansPage />} />
      <Route
        path="metrics"
        element={
          <Suspense fallback={<Loading />}>
            <AdminMetricsPage />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="tenants" replace />} />
    </Routes>
  );
}
