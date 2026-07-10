import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateAdminTenantStatus } from '../../../api/admin-tenants.js';
import { Switch } from '@/components/ui/switch';
import type { ITenant } from '../types/index.js';

interface Props {
  tenant: ITenant;
}

export function TenantStatusSwitch({ tenant }: Props): React.ReactElement {
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
    <Switch
      checked={isActive}
      disabled={isPending}
      onCheckedChange={() => mutate()}
      aria-label={isActive ? 'Desactivar empresa' : 'Activar empresa'}
      title={isActive ? 'Desactivar empresa' : 'Activar empresa'}
    />
  );
}
