import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, LayoutList, Loader2, Plus, TriangleAlert } from 'lucide-react';
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
import type { CreatePlanPayload, UpdatePlanPayload, IPlan } from '../types/index.js';

export function AdminPlansPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const { isModalOpen, planEditing, viewMode, openCreate, openEdit, closeModal, setViewMode } =
    useAdminPlansStore();
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
    },
  });

  const handleFormSuccess = (payload: CreatePlanPayload | UpdatePlanPayload): void => {
    if (planEditing) {
      updateMutation.mutate({ id: planEditing._id, payload: payload as UpdatePlanPayload });
    } else {
      createMutation.mutate(payload as CreatePlanPayload);
    }
  };

  const handleDelete = (plan: IPlan): void => {
    const ok = window.confirm(`¿Eliminar el plan "${plan.nombre}"? Esta acción no se puede deshacer.`);
    if (ok) deleteMutation.mutate(plan._id);
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planes</h1>
          <p className="mt-1 text-sm text-gray-500">Límites de uso y rentabilidad por plan</p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition-transform duration-150 ease-out hover:bg-blue-700 active:scale-[0.98]"
          >
            <Plus className="size-4" />
            Nuevo plan
          </button>
        </div>
      </div>

      {isLoading && (
        <p className="flex items-center gap-2 text-gray-500">
          <Loader2 className="size-4 animate-spin" />
          Cargando…
        </p>
      )}
      {isError && (
        <p className="flex items-center gap-2 text-red-500">
          <TriangleAlert className="size-4" />
          Error al cargar los planes.
        </p>
      )}

      {data &&
        (viewMode === 'cards' ? (
          <PlanCards plans={data} copRate={copRate} onEdit={openEdit} onDelete={handleDelete} />
        ) : (
          <PlanTable plans={data} copRate={copRate} onEdit={openEdit} onDelete={handleDelete} />
        ))}

      {deleteMutation.isError && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
          <TriangleAlert className="size-4" />
          No se pudo eliminar el plan. Puede estar asignado a una o más empresas.
        </p>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 duration-200 animate-in fade-in-0 motion-reduce:animate-none">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl duration-200 animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {planEditing ? 'Editar plan' : 'Nuevo plan'}
            </h2>
            <PlanForm plan={planEditing ?? undefined} onSuccess={handleFormSuccess} onCancel={closeModal} />
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

interface ViewToggleProps {
  value: PlanViewMode;
  onChange: (mode: PlanViewMode) => void;
}

function ViewToggle({ value, onChange }: ViewToggleProps): React.ReactElement {
  const baseBtn =
    'flex items-center justify-center rounded-md p-1.5 transition-colors duration-150 ease-out';
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
      <button
        type="button"
        aria-label="Vista de tabla"
        aria-pressed={value === 'table'}
        onClick={() => onChange('table')}
        className={`${baseBtn} ${value === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <LayoutList className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Vista de tarjetas"
        aria-pressed={value === 'cards'}
        onClick={() => onChange('cards')}
        className={`${baseBtn} ${value === 'cards' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <LayoutGrid className="size-4" />
      </button>
    </div>
  );
}
