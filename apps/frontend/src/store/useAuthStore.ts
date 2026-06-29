import { create } from 'zustand';

type Rol = 'superadmin' | 'admin' | 'coordinador' | 'asesor';

interface AuthUser {
  _id: string;
  nombre: string;
  email: string;
  rol: Rol;
  tenantId: string | null;
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
