import { create } from 'zustand';

type Rol = 'superadmin' | 'admin' | 'coordinador' | 'asesor';

interface AuthUser {
  _id: string;
  nombre: string;
  email: string;
  rol: Rol;
}

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),
}));

// Escuchar el evento global de logout (emitido por apiClient al recibir 401)
window.addEventListener('auth:logout', () => {
  useAuthStore.getState().logout();
});
