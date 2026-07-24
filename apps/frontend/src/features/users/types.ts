import type { AdminSubrol, UserRol } from '@/stores/authStore';

export interface UserDTO {
  id: string;
  tenantId: string | null;
  nombre: string;
  email: string;
  rol: UserRol;
  subrol?: AdminSubrol;
  activo: boolean;
}
