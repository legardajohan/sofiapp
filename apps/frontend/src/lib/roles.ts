import type { AdminSubrol, UserRol } from '@/stores/authStore';

export const ROL_LABEL: Record<UserRol, string> = {
  superadmin: 'Superadministrador',
  admin: 'Administrador',
};

export const SUBROL_LABEL: Record<AdminSubrol, string> = {
  director: 'Director',
  manager: 'Gerente',
  coordinator: 'Coordinador',
  secretary: 'Secretaria',
};

export function roleLabel(user: { rol: UserRol; subrol?: AdminSubrol }): string {
  const base = ROL_LABEL[user.rol];
  return user.subrol ? `${base} · ${SUBROL_LABEL[user.subrol]}` : base;
}
