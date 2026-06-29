import { Routes, Route, Navigate } from 'react-router-dom';
import AdminRoutes from './routes/AdminRoutes.js';

export default function App() {
  return (
    <Routes>
      <Route path="/admin/*" element={<AdminRoutes />} />
      <Route path="*" element={<Navigate to="/admin/tenants" replace />} />
    </Routes>
  );
}
