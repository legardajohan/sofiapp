import { create } from 'zustand';
import { disconnectSocket } from '../lib/socket.js';

export type UserRol = 'superadmin' | 'admin';
export type AdminSubrol = 'director' | 'manager' | 'coordinator' | 'secretary';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthUser {
  sub: string;
  rol: UserRol;
  subrol?: AdminSubrol;
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
