import { create } from 'zustand';

type Rol = 'superadmin' | 'admin' | 'coordinador' | 'asesor';

interface AuthUser {
  _id: string;
  nombre: string;
  email: string;
  rol: Rol;
<<<<<<< HEAD
  tenantId: string | null;
=======
>>>>>>> develop
}

interface AuthState {
  user: AuthUser | null;
<<<<<<< HEAD
  setUser: (user: AuthUser) => void;
=======
  setUser: (user: AuthUser | null) => void;
>>>>>>> develop
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
<<<<<<< HEAD
  logout: () => {
    set({ user: null });
    window.location.href = '/login';
  },
}));
=======
  logout: () => set({ user: null }),
}));

// Escuchar el evento global de logout (emitido por apiClient al recibir 401)
window.addEventListener('auth:logout', () => {
  useAuthStore.getState().logout();
});
>>>>>>> develop
