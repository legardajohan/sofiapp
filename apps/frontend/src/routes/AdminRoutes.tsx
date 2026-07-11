import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import { AdminTenantsPage } from '../features/admin-tenants/pages/AdminTenantsPage.js';
import { AdminPlansPage } from '../features/admin-plans/pages/AdminPlansPage.js';

const navClass = ({ isActive }: { isActive: boolean }): string =>
  `px-3 py-2 text-sm font-medium ${
    isActive ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-800'
  }`;

export default function AdminRoutes() {
  const user = useAuthStore((s) => s.user);

  if (!user || user.rol !== 'superadmin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div>
      <nav className="flex gap-2 border-b bg-white px-6">
        <NavLink to="/admin/tenants" className={navClass}>
          Empresas
        </NavLink>
        <NavLink to="/admin/plans" className={navClass}>
          Planes
        </NavLink>
      </nav>

      <Routes>
        <Route path="tenants" element={<AdminTenantsPage />} />
        <Route path="plans" element={<AdminPlansPage />} />
        <Route path="*" element={<Navigate to="tenants" replace />} />
      </Routes>
    </div>
  );
}
