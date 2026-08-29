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

/** Subroles que ven en claro los datos sensibles del contacto (HU-CRM-02). */
export const SUBROLES_DATOS_SENSIBLES: AdminSubrol[] = ['director', 'manager'];

/**
 * Gemelo del helper del backend (`authorize-subrol.middleware.ts`). La UI **oculta**, el backend
 * **decide**: esto sirve para no ofrecer acciones que van a fallar, nunca como única defensa.
 * Un `admin` sin `subrol` conserva acceso total, igual que en el servidor.
 */
export function puedeVerDatosSensibles(
  user: { rol: UserRol; subrol?: AdminSubrol } | null,
): boolean {
  if (!user || user.rol !== 'admin') return false;
  if (!user.subrol) return true;
  return SUBROLES_DATOS_SENSIBLES.includes(user.subrol);
}

/** Copy único para explicar por qué un dato está oculto. Se repite en tooltip y en el diálogo. */
export const MOTIVO_DATOS_SENSIBLES = 'Solo Dirección y Gerencia pueden ver este dato.';
