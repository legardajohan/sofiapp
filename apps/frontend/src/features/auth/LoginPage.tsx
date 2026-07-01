import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { login as loginRequest, type LoginDTO } from './api.js';
import { useAuthStore } from '../../stores/authStore.js';

function Spinner(): React.ReactElement {
  return (
    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
    return error.response.data.message;
  }
  return 'No fue posible iniciar sesión. Intenta de nuevo.';
}

export function LoginPage(): React.ReactElement {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const [form, setForm] = useState<LoginDTO>({ email: '', password: '' });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: (session) => {
      setErrorMsg(null);
      setUser({ sub: session.sub, rol: session.rol, nombre: session.nombre });
      navigate(session.rol === 'superadmin' ? '/admin' : '/', { replace: true });
    },
    onError: (err: unknown) => {
      setErrorMsg(extractErrorMessage(err));
    },
  });

  function handleChange(field: keyof LoginDTO): (e: React.ChangeEvent<HTMLInputElement>) => void {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setErrorMsg(null);
    loginMutation.mutate(form);
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#faf8ff] px-4">
      <div className="w-full sm:max-w-[400px]">
        <div className="flex justify-center mb-6">
          <span className="text-2xl font-bold text-[#2563eb] tracking-tight">SofiApp</span>
        </div>

        <div className="bg-white py-8 px-6 shadow-[0_4px_12px_rgba(0,0,0,0.05)] rounded-xl border border-[#e1e2ed] sm:px-10">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[#191b23] mb-2">Iniciar sesión</h2>
            <p className="text-sm text-[#434655]">
              Ingresa tus credenciales para continuar al espacio de trabajo.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#191b23] mb-1" htmlFor="email">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={handleChange('email')}
                placeholder="tu@empresa.com"
                className="block w-full px-3 py-2 border border-[#c3c6d7] rounded-lg bg-white text-[#191b23] placeholder-[#737686] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#191b23] mb-1" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={form.password}
                onChange={handleChange('password')}
                placeholder="••••••••"
                className="block w-full px-3 py-2 border border-[#c3c6d7] rounded-lg bg-white text-[#191b23] placeholder-[#737686] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-colors"
              />
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <svg className="w-4 h-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40"
            >
              {loginMutation.isPending ? (
                <>
                  <Spinner />
                  Ingresando...
                </>
              ) : (
                'Ingresar'
              )}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-sm text-[#737686]">
          © 2026 SofiApp. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
