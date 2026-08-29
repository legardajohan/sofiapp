import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Plus, Search, X } from 'lucide-react';
import { useAdminTenantsStore } from '../useAdminTenantsStore.js';
import {
  getAdminTenants,
  createAdminTenant,
  updateAdminTenant,
  deleteAdminTenant,
} from '../../../api/admin-tenants.js';
import { TenantTable } from '../components/TenantTable.js';
import { TenantForm } from '../components/TenantForm.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TenantUsagePanel } from '../components/TenantUsagePanel.js';
import { getAdminPlans } from '../../../api/admin-plans.js';
import type { CreateTenantPayload, UpdateTenantPayload, ITenant } from '../types/index.js';

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
    setSearch,
    setPage,
  } = useAdminTenantsStore();

  // Estado local del texto tecleado; sólo se lanza la búsqueda al enviar (Enter/botón),
  // así el input no se desmonta con cada recarga y no pierde el foco.
  const [searchInput, setSearchInput] = useState(searchTerm);

  const handleSearchSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;
    setSearchInput(value);
    // Al vaciar el buscador se restaura el listado completo sin necesidad de Enter.
    if (value.trim() === '' && searchTerm !== '') {
      setSearch('');
    }
  };

  const handleClearSearch = (): void => {
    setSearchInput('');
    setSearch('');
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-tenants', searchTerm, currentPage],
    queryFn: () => getAdminTenants({ search: searchTerm || undefined, page: currentPage }),
    placeholderData: keepPreviousData,
  });

  const { data: plans } = useQuery({ queryKey: ['admin-plans'], queryFn: getAdminPlans });
  const activePlans = (plans ?? []).filter((p) => p.activo).map((p) => ({ _id: p._id, nombre: p.nombre }));
  // Mapa completo (incluye inactivos) para mostrar el nombre del plan asignado en la tabla.
  const planNameById = new Map((plans ?? []).map((p) => [p._id, p.nombre]));

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

  const deleteMutation = useMutation({
    mutationFn: deleteAdminTenant,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
    },
  });

  const handleFormSuccess = (payload: CreateTenantPayload | UpdateTenantPayload): void => {
    if (tenantEditing) {
      updateMutation.mutate({ id: tenantEditing._id, payload: payload as UpdateTenantPayload });
    } else {
      createMutation.mutate(payload as CreateTenantPayload);
    }
  };

  // La confirmación vive en el AlertDialog que envuelve el botón de borrar (TenantTable).
  const handleDelete = (tenant: ITenant): void => {
    deleteMutation.mutate(tenant._id);
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

      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Busca por nombre o slug y presiona enter"
            value={searchInput}
            onChange={handleSearchChange}
            className="pl-9"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      {searchTerm && (
        <p className="text-sm text-muted-foreground">
          Resultados para «{searchTerm}».{' '}
          <button
            type="button"
            onClick={handleClearSearch}
            className="font-medium text-primary hover:underline"
          >
            Ver todas
          </button>
        </p>
      )}

      {isLoading && <p className="text-muted-foreground">Cargando…</p>}
      {isError && <p className="text-destructive">Error al cargar las empresas.</p>}

      {deleteMutation.isError && (
        <p className="text-sm text-destructive">No se pudo eliminar la empresa. Intenta de nuevo.</p>
      )}

      {data && (
        <TenantTable
          tenants={data.data}
          total={data.total}
          page={data.page}
          limit={data.limit}
          planNameById={planNameById}
          onPageChange={setPage}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tenantEditing ? 'Editar empresa' : 'Nueva empresa'}</DialogTitle>
          </DialogHeader>
          <TenantForm
            tenant={tenantEditing ?? undefined}
            plans={activePlans}
            onSuccess={handleFormSuccess}
            onCancel={closeModal}
          />
          {(createMutation.isError || updateMutation.isError) && (
            <p className="text-sm text-destructive">Error al guardar. Verifica los datos e intenta de nuevo.</p>
          )}
          {tenantEditing && (
            <TenantUsagePanel
              tenantId={tenantEditing._id}
              currentPlanId={tenantEditing.planId}
              plans={activePlans}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
