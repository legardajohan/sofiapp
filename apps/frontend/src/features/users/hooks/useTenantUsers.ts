import { useQuery } from '@tanstack/react-query';
import { fetchTenantUsers } from '../api.js';
import type { UserDTO } from '../types.js';

/** Admins del tenant para selectores de asignación. Cambian poco: staleTime largo. */
export function useTenantUsers() {
  return useQuery<UserDTO[]>({
    queryKey: ['users'],
    queryFn: fetchTenantUsers,
    staleTime: 5 * 60 * 1000,
  });
}
