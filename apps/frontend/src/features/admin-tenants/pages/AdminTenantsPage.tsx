import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useAdminTenantsStore } from '../useAdminTenantsStore.js';
import {
  getAdminTenants,
  createAdminTenant,
  updateAdminTenant,
} from '../../../api/admin-tenants.js';
import { TenantTable } from '../components/TenantTable.js';
import { TenantForm } from '../components/TenantForm.js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CreateTenantPayload, UpdateTenantPayload } from '../types/index.js';

export function AdminTenantsPage(): React.ReactElement {
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Empresas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestión de tenants del sistema</p>
        </div>
        <Button onClick={openCreate}>
          <Plus />
          Nueva empresa
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Cargando…</p>}
      {isError && <p className="text-destructive">Error al cargar las empresas.</p>}

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

      <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tenantEditing ? 'Editar empresa' : 'Nueva empresa'}</DialogTitle>
          </DialogHeader>
          <TenantForm
            tenant={tenantEditing ?? undefined}
            onSuccess={handleFormSuccess}
            onCancel={closeModal}
          />
          {(createMutation.isError || updateMutation.isError) && (
            <p className="text-sm text-destructive">Error al guardar. Verifica los datos e intenta de nuevo.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
