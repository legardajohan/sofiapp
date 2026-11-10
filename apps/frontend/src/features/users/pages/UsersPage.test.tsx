import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { UsersPage } from './UsersPage.js';
import { fetchManageUsers, fetchTenantUsers, setUserEstado } from '../api.js';
import { useAuthStore } from '@/stores/authStore';
import type { UserDTO } from '../types.js';

vi.mock('../api.js', () => ({
  fetchManageUsers: vi.fn(),
  fetchTenantUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  setUserEstado: vi.fn(),
  resetUserPassword: vi.fn(),
}));

const mockManage = vi.mocked(fetchManageUsers);
const mockActivos = vi.mocked(fetchTenantUsers);
const mockEstado = vi.mocked(setUserEstado);

const base = { tenantId: 't1', rol: 'admin' as const, activo: true };
const OWNER: UserDTO = { ...base, id: 'u-owner', nombre: 'Olga Propietaria', email: 'o@t.com' };
const CARLA: UserDTO = { ...base, id: 'u-carla', nombre: 'Carla', email: 'c@t.com', subrol: 'coordinator' };
const DIEGO: UserDTO = { ...base, id: 'u-diego', nombre: 'Diego', email: 'd@t.com', subrol: 'director' };

function conflicto409(): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError('409', 'ERR_BAD_REQUEST', { headers }, null, {
    status: 409,
    statusText: 'Conflict',
    headers: {},
    config: { headers },
    data: {
      code: 'USER_HAS_ASSIGNED_CONVERSATIONS',
      asignadas: 3,
      flujos: 1,
      message: 'El usuario tiene conversaciones asignadas.',
    },
  });
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <UsersPage />
    </QueryClientProvider>,
  );
}

async function abrirDesactivar(nombre: string): Promise<void> {
  await userEvent.click(await screen.findByLabelText(`Acciones para ${nombre}`));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Desactivar' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { sub: OWNER.id, rol: 'admin' }, status: 'authenticated' });
  mockManage.mockResolvedValue([OWNER, CARLA, DIEGO]);
  mockActivos.mockResolvedValue([OWNER, CARLA, DIEGO]);
});

describe('UsersPage — AUTH-03', () => {
  it('no ofrece desactivarse ni restablecer la propia contraseña', async () => {
    renderPage();
    await userEvent.click(await screen.findByLabelText('Acciones para Olga Propietaria'));
    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Desactivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Restablecer contraseña' })).not.toBeInTheDocument();
  });

  it('un director no ve acciones sobre el propietario', async () => {
    useAuthStore.setState({ user: { sub: DIEGO.id, rol: 'admin', subrol: 'director' }, status: 'authenticated' });
    renderPage();
    expect(await screen.findByLabelText('Acciones para Carla')).toBeInTheDocument();
    expect(screen.queryByLabelText('Acciones para Olga Propietaria')).not.toBeInTheDocument();
  });

  it('sin conversaciones asignadas desactiva al confirmar', async () => {
    mockEstado.mockResolvedValue({ ...CARLA, activo: false });
    renderPage();
    await abrirDesactivar('Carla');
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(mockEstado).toHaveBeenCalledWith('u-carla', { activo: false }));
  });

  it('ante el 409 pregunta qué hacer y mueve a la bandeja sin asignar', async () => {
    mockEstado.mockRejectedValueOnce(conflicto409()).mockResolvedValueOnce({ ...CARLA, activo: false });
    renderPage();
    await abrirDesactivar('Carla');
    const dialogo = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Desactivar' }));

    // El diálogo sigue abierto y ahora explica el conteo y los flujos afectados.
    expect(await within(dialogo).findByText(/Tiene 3 conversaciones asignadas/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/También aparece en 1 flujo/)).toBeInTheDocument();

    // Reasignar exige elegir a alguien: el botón está deshabilitado hasta entonces.
    expect(within(dialogo).getByRole('button', { name: 'Reasignar y desactivar' })).toBeDisabled();

    await userEvent.click(within(dialogo).getByLabelText(/Moverlas a la bandeja sin asignar/));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Mover a la bandeja y desactivar' }));

    await waitFor(() =>
      expect(mockEstado).toHaveBeenLastCalledWith('u-carla', {
        activo: false,
        conversaciones: { accion: 'desasignar' },
      }),
    );
  });
});
