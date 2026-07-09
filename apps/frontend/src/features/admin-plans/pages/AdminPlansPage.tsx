import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAdminPlansStore } from '../useAdminPlansStore.js';
import { getAdminPlans, createAdminPlan, updateAdminPlan } from '../../../api/admin-plans.js';
import { PlanTable } from '../components/PlanTable.js';
import { PlanForm } from '../components/PlanForm.js';
import type { CreatePlanPayload, UpdatePlanPayload } from '../types/index.js';

export function AdminPlansPage() {
  const queryClient = useQueryClient();
  const { isModalOpen, planEditing, openCreate, openEdit, closeModal } = useAdminPlansStore();

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

  const handleFormSuccess = (payload: CreatePlanPayload | UpdatePlanPayload): void => {
    if (planEditing) {
      updateMutation.mutate({ id: planEditing._id, payload: payload as UpdatePlanPayload });
    } else {
      createMutation.mutate(payload as CreatePlanPayload);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planes</h1>
          <p className="text-sm text-gray-500 mt-1">Límites de uso y rentabilidad por plan</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          + Nuevo plan
        </button>
      </div>

      {isLoading && <p className="text-gray-500">Cargando…</p>}
      {isError && <p className="text-red-500">Error al cargar los planes.</p>}

      {data && <PlanTable plans={data} onEdit={openEdit} />}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {planEditing ? 'Editar plan' : 'Nuevo plan'}
            </h2>
            <PlanForm
              plan={planEditing ?? undefined}
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
