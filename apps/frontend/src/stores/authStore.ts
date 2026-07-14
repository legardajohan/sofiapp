import { create } from 'zustand';

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
    window.location.href = '/login';
  },
}));
