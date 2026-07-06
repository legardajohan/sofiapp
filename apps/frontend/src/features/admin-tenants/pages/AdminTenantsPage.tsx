import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAdminTenantsStore } from '../useAdminTenantsStore.js';
import {
  getAdminTenants,
  createAdminTenant,
  updateAdminTenant,
} from '../../../api/admin-tenants.js';
import { TenantTable } from '../components/TenantTable.js';
import { TenantForm } from '../components/TenantForm.js';
import type { CreateTenantPayload, UpdateTenantPayload } from '../types/index.js';

export function AdminTenantsPage() {
  const queryClient = useQueryClient();
  const {
    searchTerm,
    currentPage,
    isModalOpen,
    tenantEditing,
    openCreate,
    openEdit,
    closeModal,
    setPage,
  } = useAdminTenantsStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-tenants', searchTerm, currentPage],
    queryFn: () => getAdminTenants({ search: searchTerm || undefined, page: currentPage }),
  });

  const createMutation = useMutation({
    mutationFn: createAdminTenant,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTenantPayload }) =>
      updateAdminTenant(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      closeModal();
    },
  });

  const handleFormSuccess = (payload: CreateTenantPayload | UpdateTenantPayload): void => {
    if (tenantEditing) {
      updateMutation.mutate({ id: tenantEditing._id, payload: payload as UpdateTenantPayload });
    } else {
      createMutation.mutate(payload as CreateTenantPayload);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empresas</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión de tenants del sistema</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          + Nueva empresa
        </button>
      </div>

      {isLoading && <p className="text-gray-500">Cargando…</p>}
      {isError && <p className="text-red-500">Error al cargar las empresas.</p>}

      {data && (
        <TenantTable
          tenants={data.data}
          total={data.total}
          page={data.page}
          limit={data.limit}
          onPageChange={setPage}
          onEdit={openEdit}
        />
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {tenantEditing ? 'Editar empresa' : 'Nueva empresa'}
            </h2>
            <TenantForm
              tenant={tenantEditing ?? undefined}
              onSuccess={handleFormSuccess}
              onCancel={closeModal}
            />
            {(createMutation.isError || updateMutation.isError) && (
              <p className="mt-2 text-sm text-red-600">
                Error al guardar. Verifica los datos e intenta de nuevo.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
