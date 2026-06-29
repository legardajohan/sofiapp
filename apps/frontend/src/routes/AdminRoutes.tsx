import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore.js';
import { AdminTenantsPage } from '../features/admin-tenants/pages/AdminTenantsPage.js';

export default function AdminRoutes() {
  const user = useAuthStore((s) => s.user);

  if (!user || user.rol !== 'superadmin') {
    return <Navigate to="/" replace />;
  }

  return (
    <Routes>
      <Route path="tenants" element={<AdminTenantsPage />} />
      <Route path="*" element={<Navigate to="tenants" replace />} />
    </Routes>
  );
}
