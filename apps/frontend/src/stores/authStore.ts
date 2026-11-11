import { create } from 'zustand';
import { disconnectSocket } from '../lib/socket.js';

export type UserRol = 'superadmin' | 'admin';
/** Rol dentro de la empresa (AUTH-04, ADR 0017). Jerarquía: administrador > coordinador > asesor. */
export type RolEmpresa = 'administrador' | 'coordinador' | 'asesor';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthUser {
  sub: string;
  rol: UserRol;
  /** Siempre presente para `rol: 'admin'`; el superadmin no lo tiene. */
  rolEmpresa?: RolEmpresa;
  nombre?: string;
}

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  setUser: (user: AuthUser) => void;
  setStatus: (status: AuthStatus) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'idle',
  setUser: (user) => set({ user, status: 'authenticated' }),
  setStatus: (status) => set({ status }),
  logout: () => {
    set({ user: null, status: 'unauthenticated' });
    // La sesión, no la pantalla, es dueña del socket (HU-NOTIF-01): se cierra aquí, no al salir
    // de /inbox.
    disconnectSocket();
    window.location.href = '/login';
  },
}));
