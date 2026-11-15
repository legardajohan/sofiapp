import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import {
  changeOwnPassword,
  createUser,
  deleteUser,
  fetchCupoUsuarios,
  fetchManageUsers,
  resetUserPassword,
  setUserEstado,
  updateUser,
} from '../api.js';
import type {
  CupoUsuarios,
  DeleteUserPayload,
  DependenciasUsuario,
  CreateUserPayload,
  ManageUsersFilters,
  SetUserEstadoPayload,
  UpdateUserPayload,
  UserDTO,
} from '../types.js';

/** Mensaje del backend si lo hay: "Ya existe un usuario con ese email" dice más que un genérico. */
export function motivoError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
    return error.response.data.message;
  }
  return fallback;
}

/**
 * El 409 de dependencias no es un error para el usuario: es la pregunta de qué hacer con sus
 * conversaciones y su equipo antes de desactivarlo o de cambiarle el rol.
 */
export function dependenciasDe(error: unknown): DependenciasUsuario | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return null;
  const data = error.response.data as Partial<DependenciasUsuario> | undefined;
  return data?.code === 'USER_HAS_DEPENDENCIES' ? (data as DependenciasUsuario) : null;
}

export function useManageUsers(filters: ManageUsersFilters, enabled = true) {
  return useQuery<UserDTO[]>({
    queryKey: ['users', 'manage', filters],
    queryFn: () => fetchManageUsers(filters),
    enabled,
    // Escribir en el buscador no debe vaciar la tabla entre una tecla y otra.
    placeholderData: keepPreviousData,
  });
}

/** `['users']` cubre la tabla de gestión y el selector de asignación de la bandeja. */
function useInvalidarUsuarios(): () => void {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['users'] });
}

export function useCreateUser() {
  const invalidar = useInvalidarUsuarios();
  return useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: (user) => {
      invalidar();
      toast.success(`${user.nombre} ya puede iniciar sesión`);
    },
    onError: (error) => toast.error(motivoError(error, 'No se pudo crear el usuario.')),
  });
}

/** Edita. El 409 de un coordinador con equipo **no** muestra toast: lo resuelve el diálogo de rol. */
export function useUpdateUser() {
  const invalidar = useInvalidarUsuarios();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserPayload }) =>
      updateUser(id, payload),
    onSuccess: () => {
      invalidar();
      toast.success('Cambios guardados');
    },
    onError: (error) => {
      if (dependenciasDe(error)) return;
      toast.error(motivoError(error, 'No se pudieron guardar los cambios.'));
    },
  });
}

/**
 * Activa o desactiva. El 409 de dependencias **no** muestra toast: lo resuelve el diálogo, que pasa
 * a preguntar qué hacer con las conversaciones y, si es coordinador, con su equipo.
 */
export function useSetUserEstado() {
  const qc = useQueryClient();
  const invalidar = useInvalidarUsuarios();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SetUserEstadoPayload }) =>
      setUserEstado(id, payload),
    onSuccess: (user, { payload }) => {
      invalidar();
      if (payload.conversaciones) void qc.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(
        user.activo ? `${user.nombre} está activo de nuevo` : `${user.nombre} quedó desactivado`,
      );
    },
    onError: (error) => {
      if (dependenciasDe(error)) return;
      toast.error(motivoError(error, 'No se pudo cambiar el estado del usuario.'));
    },
  });
}

/** Elimina (borrado lógico). El 409 de dependencias lo resuelve el diálogo, como al desactivar. */
export function useDeleteUser() {
  const qc = useQueryClient();
  const invalidar = useInvalidarUsuarios();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DeleteUserPayload }) => deleteUser(id, payload),
    onSuccess: (user, { payload }) => {
      invalidar();
      if (payload.conversaciones) void qc.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(`${user.nombre} fue eliminado`);
    },
    onError: (error) => {
      if (dependenciasDe(error)) return;
      toast.error(motivoError(error, 'No se pudo eliminar el usuario.'));
    },
  });
}

export function useCupoUsuarios(enabled = true) {
  return useQuery<CupoUsuarios>({
    queryKey: ['users', 'cupo'],
    queryFn: fetchCupoUsuarios,
    enabled,
  });
}

export function useChangeOwnPassword() {
  return useMutation({
    mutationFn: ({ actual, nueva }: { actual: string; nueva: string }) => changeOwnPassword(actual, nueva),
    onSuccess: () => toast.success('Contraseña cambiada. Se cerraron tus otras sesiones.'),
    // El error de "contraseña actual incorrecta" lo muestra el diálogo junto al campo.
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      resetUserPassword(id, password),
    onSuccess: () => toast.success('Contraseña restablecida'),
    onError: (error) => toast.error(motivoError(error, 'No se pudo restablecer la contraseña.')),
  });
}
