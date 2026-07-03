import { create } from 'zustand';

export type UserRol = 'superadmin' | 'admin' | 'coordinador' | 'asesor';

interface AuthUser {
  sub: string;
  rol: UserRol;
  nombre?: string;
}

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => {
    set({ user: null });
    window.location.href = '/login';
  },
}));
