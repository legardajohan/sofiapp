import { useEffect, useRef } from 'react';
import { useAdminTenantsStore } from '../useAdminTenantsStore.js';
import { TenantStatusSwitch } from './TenantStatusSwitch.js';
import type { ITenant, EstadoTenant } from '../types/index.js';

interface Props {
  tenants: ITenant[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onEdit: (tenant: ITenant) => void;
}

const estadoChip: Record<EstadoTenant, string> = {
  activo: 'bg-green-100 text-green-800',
  suspendido: 'bg-gray-100 text-gray-700',
  prueba: 'bg-yellow-100 text-yellow-800',
};

export function TenantTable({ tenants, total, page, limit, onPageChange, onEdit }: Props) {
  const { setSearch } = useAdminTenantsStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(value), 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <input
        type="text"
        placeholder="Buscar por nombre o slug…"
        onChange={handleSearch}
        className="mb-4 w-full rounded-md border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Nombre', 'Slug', 'Estado', 'Plan', 'Creado', 'Acciones'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  No hay empresas registradas.
                </td>
              </tr>
            ) : (
              tenants.map((tenant) => (
                <tr key={tenant._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{tenant.nombre}</td>
                  <td className="px-4 py-3 text-gray-500">{tenant.slug}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${estadoChip[tenant.estado]}`}
                      >
                        {tenant.estado}
                      </span>
                      <TenantStatusSwitch tenant={tenant} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{tenant.planId ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(tenant.createdAt).toLocaleDateString('es-CO')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onEdit(tenant)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-gray-500">
            {total} empresa{total !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded border px-3 py-1 disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="px-3 py-1">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded border px-3 py-1 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
