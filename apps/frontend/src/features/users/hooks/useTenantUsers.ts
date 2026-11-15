import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchTenantUsers, fetchTenantUsersInactivos } from '../api.js';
import type { UserDTO } from '../types.js';

interface Opciones {
  /**
   * AUTH-06: vuelve a pedir la lista al montar (abrir un formulario o un menú). Sin esto, una sesión
   * abierta antes de que se creara un usuario no lo ve hasta que caduque la caché.
   */
  alAbrir?: boolean;
}

/** Usuarios activos del tenant para selectores de asignación. Cambian poco: staleTime largo. */
export function useTenantUsers(opciones: Opciones = {}): UseQueryResult<UserDTO[]> {
  return useQuery<UserDTO[]>({
    queryKey: ['users'],
    queryFn: fetchTenantUsers,
    staleTime: 5 * 60 * 1000,
    ...(opciones.alAbrir ? { refetchOnMount: 'always' as const } : {}),
  });
}

/**
 * AUTH-06: activos más inactivos, para FILTROS (bandeja, leads): las conversaciones de alguien
 * desactivado siguen existiendo y hay que poder encontrarlas. Nunca para asignar.
 */
export function useTenantUsersConInactivos(): { data: UserDTO[] | undefined; isLoading: boolean } {
  const activos = useTenantUsers();
  const inactivos = useQuery<UserDTO[]>({
    queryKey: ['users', 'inactivos'],
    queryFn: fetchTenantUsersInactivos,
    staleTime: 5 * 60 * 1000,
  });
  return {
    data: activos.data ? [...activos.data, ...(inactivos.data ?? [])] : undefined,
    isLoading: activos.isLoading,
  };
}
