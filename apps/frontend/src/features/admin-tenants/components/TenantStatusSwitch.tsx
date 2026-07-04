import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateAdminTenantStatus } from '../../../api/admin-tenants.js';
import type { ITenant } from '../types/index.js';

interface Props {
  tenant: ITenant;
}

export function TenantStatusSwitch({ tenant }: Props) {
  const queryClient = useQueryClient();
  const isActive = tenant.estado === 'activo';

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      updateAdminTenantStatus(tenant._id, isActive ? 'suspendido' : 'activo'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
    },
  });

  return (
    <button
      type="button"
      disabled={isPending || tenant.estado === 'prueba'}
      onClick={() => mutate()}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${
        isActive ? 'bg-green-500' : 'bg-gray-300'
      }`}
      title={
        tenant.estado === 'prueba'
          ? 'Estado prueba: actívala primero'
          : isActive
            ? 'Desactivar empresa'
            : 'Activar empresa'
      }
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          isActive ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
