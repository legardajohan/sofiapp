import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, LayoutList, Loader2, Plus, TriangleAlert } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useAdminPlansStore, type PlanViewMode } from '../useAdminPlansStore.js';
import {
  getAdminPlans,
  createAdminPlan,
  updateAdminPlan,
  deleteAdminPlan,
} from '../../../api/admin-plans.js';
import { PlanTable } from '../components/PlanTable.js';
import { PlanCards } from '../components/PlanCards.js';
import { PlanForm } from '../components/PlanForm.js';
import { useExchangeRate } from '../hooks/useExchangeRate.js';
import { extractApiErrorMessage, extractPlanInUseError, isPlanInUse } from '../planUsage.js';
import type { CreatePlanPayload, UpdatePlanPayload, IPlan } from '../types/index.js';

export function AdminPlansPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const {
    isModalOpen,
    planEditing,
    planDeleting,
    viewMode,
    openCreate,
    openEdit,
    closeModal,
    openDelete,
    closeDelete,
    setViewMode,
  } = useAdminPlansStore();
  const { rate: copRate } = useExchangeRate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: getAdminPlans,
  });

  const createMutation = useMutation({
    mutationFn: createAdminPlan,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePlanPayload }) =>
      updateAdminPlan(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminPlan,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      closeDelete();
    },
  });

  const handleFormSuccess = (payload: CreatePlanPayload | UpdatePlanPayload): void => {
    if (planEditing) {
      updateMutation.mutate({ id: planEditing._id, payload: payload as UpdatePlanPayload });
    } else {
      createMutation.mutate(payload as CreatePlanPayload);
    }
  };

  const confirmDelete = (): void => {
    if (planDeleting) deleteMutation.mutate(planDeleting._id);
  };

  // Guardas defensivas: aunque el botón ya se deshabilita, no abrimos la acción sobre un plan en uso
  // (defensa en profundidad; el backend es la validación autoritativa).
  const handleEdit = (plan: IPlan): void => {
    if (!isPlanInUse(plan)) openEdit(plan);
  };
  const handleDelete = (plan: IPlan): void => {
    if (!isPlanInUse(plan)) openDelete(plan);
  };

  // Si una operación falla con 409 PLAN_IN_USE (p. ej. carrera: se asignó el plan entre listar y
  // actuar), mostramos el mensaje con las empresas que devuelve el backend.
  const updateInUse = extractPlanInUseError(updateMutation.error);
  const deleteInUse = extractPlanInUseError(deleteMutation.error);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Límites de uso y rentabilidad por plan</p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-transform duration-150 ease-out hover:bg-primary-hover active:scale-[0.98]"
          >
            <Plus className="size-4" />
            Nuevo plan
          </button>
        </div>
      </div>

      {isLoading && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando…
        </p>
      )}
      {isError && (
        <p className="flex items-center gap-2 text-destructive">
          <TriangleAlert className="size-4" />
          Error al cargar los planes.
        </p>
      )}

      {data &&
        (viewMode === 'cards' ? (
          <PlanCards plans={data} copRate={copRate} onEdit={handleEdit} onDelete={handleDelete} />
        ) : (
          <PlanTable plans={data} copRate={copRate} onEdit={handleEdit} onDelete={handleDelete} />
        ))}

      {/* Modal de crear/editar — reutiliza el componente Modal del UI kit. */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={planEditing ? 'Editar plan' : 'Nuevo plan'}
        dismissible={!createMutation.isPending && !updateMutation.isPending}
      >
        <PlanForm plan={planEditing ?? undefined} onSuccess={handleFormSuccess} onCancel={closeModal} />
        {updateInUse ? (
          <p className="mt-2 flex items-start gap-1.5 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              No se puede editar el plan {updateInUse.planName}: está siendo utilizado por{' '}
              {updateInUse.tenantCount} empresa(s): {updateInUse.tenants.map((t) => t.name).join(', ')}.
            </span>
          </p>
        ) : (
          (createMutation.isError || updateMutation.isError) && (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                {extractApiErrorMessage(updateMutation.error ?? createMutation.error) ??
                  'Error al guardar. Verifica los datos e intenta de nuevo.'}
              </span>
            </p>
          )
        )}
      </Modal>

      {/* Confirmación de borrado — mismo componente Modal, con footer de acciones. */}
      <Modal
        isOpen={planDeleting !== null}
        onClose={closeDelete}
        size="sm"
        title="Eliminar plan"
        description={
          planDeleting
            ? `¿Eliminar el plan "${planDeleting.nombre}"? Esta acción no se puede deshacer.`
            : undefined
        }
        dismissible={!deleteMutation.isPending}
        footer={
          <>
            <Button variant="outline" onClick={closeDelete} disabled={deleteMutation.isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Eliminar
            </Button>
          </>
        }
      >
        {deleteMutation.isError &&
          (deleteInUse ? (
            <p className="flex items-start gap-1.5 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                No se puede eliminar el plan {deleteInUse.planName}: está siendo utilizado por{' '}
                {deleteInUse.tenantCount} empresa(s):{' '}
                {deleteInUse.tenants.map((t) => t.name).join(', ')}.
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert className="size-4" />
              No se pudo eliminar el plan. Puede estar asignado a una o más empresas.
            </p>
          ))}
      </Modal>
    </div>
  );
}

interface ViewToggleProps {
  value: PlanViewMode;
  onChange: (mode: PlanViewMode) => void;
}

function ViewToggle({ value, onChange }: ViewToggleProps): React.ReactElement {
  const baseBtn =
    'flex items-center justify-center rounded-md p-1.5 transition-colors duration-150 ease-out';
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5">
      <button
        type="button"
        aria-label="Vista de tabla"
        aria-pressed={value === 'table'}
        onClick={() => onChange('table')}
        className={`${baseBtn} ${value === 'table' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <LayoutList className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Vista de tarjetas"
        aria-pressed={value === 'cards'}
        onClick={() => onChange('cards')}
        className={`${baseBtn} ${value === 'cards' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <LayoutGrid className="size-4" />
      </button>
    </div>
  );
}
