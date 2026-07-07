import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { login as loginRequest, type LoginDTO } from './api.js';
import { useAuthStore } from '../../stores/authStore.js';
import loginBg from '../../assets/login-bg.svg';
import { SofiAppLogin } from './components/SofiAppLogin.js';

function Spinner(): React.ReactElement {
  return (
    <svg className="animate-spin h-4 w-4 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
    <div className="min-h-screen flex flex-col justify-center items-center bg-background px-4 py-8">
      <div className="w-full max-w-4xl grid md:grid-cols-2 bg-card shadow-xl rounded-xl border border-border overflow-hidden">
        {/* Columna 1: logo + nombre, tagline y, debajo, la ilustración */}
        <div className="hidden md:flex flex-col items-center pt-12 px-8 min-h-[560px]">
          <div className="flex items-end justify-center gap-3 pt-5">
            <SofiAppLogin width="180px" />
          </div>

          <p className="mt-2 text-center text-md font-medium text-secondary-foreground">
            Compra fácil, vende más.
          </p>

          <div
            className="w-full flex-1 mt-4 bg-contain bg-bottom bg-no-repeat"
            style={{ backgroundImage: `url(${loginBg})` }}
          />
        </div>

        {/* Columna 2: formulario de login */}
        <div className="py-8 px-6 sm:px-10 flex flex-col justify-center">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground">Iniciar sesión</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="email">
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
                className="block w-full px-3 py-2 border border-input rounded-lg bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="password">
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
                className="block w-full px-3 py-2 border border-input rounded-lg bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-colors"
              />
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 p-3 bg-destructive-subtle border border-destructive/30 rounded-lg text-sm text-destructive">
                <svg className="w-4 h-4 flex-shrink-0 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-primary-foreground bg-primary hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40"
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

          <p className="mt-8 text-center text-sm text-muted-foreground">
            © 2026 SofiApp. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
