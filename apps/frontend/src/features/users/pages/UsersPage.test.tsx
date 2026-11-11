import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { UsersPage } from './UsersPage.js';
import { fetchManageUsers, fetchTenantUsers, setUserEstado } from '../api.js';
import { useAuthStore } from '@/stores/authStore';
import type { ManageUsersFilters, UserDTO } from '../types.js';

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

const base = { tenantId: 't1', rol: 'admin' as const, activo: true, coordinadorId: null };
const ANA: UserDTO = { ...base, id: 'u-ana', nombre: 'Ana Admin', email: 'a@t.com', rolEmpresa: 'administrador' };
const CARLA: UserDTO = { ...base, id: 'u-carla', nombre: 'Carla', email: 'c@t.com', rolEmpresa: 'coordinador' };
const ANDRES: UserDTO = {
  ...base, id: 'u-andres', nombre: 'Andrés', email: 'an@t.com', rolEmpresa: 'asesor', coordinadorId: 'u-carla',
};
const BEA: UserDTO = { ...base, id: 'u-bea', nombre: 'Bea', email: 'b@t.com', rolEmpresa: 'asesor' };
const TODOS = [ANA, CARLA, ANDRES, BEA];

function dependencias409(data: { asignadas: number; flujos: number; asesores: number }): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError('409', 'ERR_BAD_REQUEST', { headers }, null, {
    status: 409,
    statusText: 'Conflict',
    headers: {},
    config: { headers },
    data: { code: 'USER_HAS_DEPENDENCIES', message: 'Pendiente.', ...data },
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
  useAuthStore.setState({ user: { sub: ANA.id, rol: 'admin', rolEmpresa: 'administrador' }, status: 'authenticated' });
  mockManage.mockImplementation(async (f: ManageUsersFilters) =>
    f.rolEmpresa === 'coordinador' ? [CARLA] : TODOS,
  );
  mockActivos.mockResolvedValue(TODOS);
});

describe('UsersPage — AUTH-03 / AUTH-04', () => {
  it('no ofrece desactivarse ni restablecer la propia contraseña', async () => {
    renderPage();
    await userEvent.click(await screen.findByLabelText('Acciones para Ana Admin'));
    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Desactivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Restablecer contraseña' })).not.toBeInTheDocument();
  });

  it('el administrador ve el rol y el coordinador de cada asesor', async () => {
    renderPage();
    const fila = (await screen.findByText('Andrés')).closest('tr');
    expect(fila).not.toBeNull();
    expect(within(fila as HTMLElement).getAllByText('Asesor').length).toBeGreaterThan(0);
    expect(await within(fila as HTMLElement).findByText('Carla')).toBeInTheDocument();
    const filaBea = (await screen.findByText('Bea')).closest('tr') as HTMLElement;
    expect(within(filaBea).getByText('Sin coordinador')).toBeInTheDocument();
    expect(screen.getByLabelText('Filtrar por rol')).toBeInTheDocument();
    expect(screen.getByLabelText('Filtrar por coordinador')).toBeInTheDocument();
  });

  it('el coordinador ve "Mi equipo", sin filtros de rol ni de coordinador, y crea asesores', async () => {
    useAuthStore.setState({ user: { sub: CARLA.id, rol: 'admin', rolEmpresa: 'coordinador' }, status: 'authenticated' });
    mockManage.mockResolvedValue([ANDRES]);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Mi equipo' })).toBeInTheDocument();
    expect(await screen.findByText('Andrés')).toBeInTheDocument();
    expect(screen.queryByLabelText('Filtrar por rol')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filtrar por coordinador')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Crear asesor' }));
    // El coordinador no elige rol: el asesor nace en su equipo.
    expect(await screen.findByRole('heading', { name: 'Crear asesor' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Rol en la empresa' })).not.toBeInTheDocument();
  });

  it('sin dependencias desactiva al confirmar', async () => {
    mockEstado.mockResolvedValue({ ...BEA, activo: false });
    renderPage();
    await abrirDesactivar('Bea');
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(mockEstado).toHaveBeenCalledWith('u-bea', { activo: false }));
  });

  it('ante el 409 de un coordinador resuelve conversaciones y equipo en un mismo paso', async () => {
    mockEstado
      .mockRejectedValueOnce(dependencias409({ asignadas: 3, flujos: 1, asesores: 2 }))
      .mockResolvedValueOnce({ ...CARLA, activo: false });
    renderPage();
    await abrirDesactivar('Carla');
    const dialogo = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Desactivar' }));

    expect(await within(dialogo).findByText(/Tiene 3 conversaciones asignadas y 2 asesores a su cargo/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/También aparece en 1 flujo/)).toBeInTheDocument();
    // Reasignar exige elegir a alguien: el botón está deshabilitado hasta entonces.
    expect(within(dialogo).getByRole('button', { name: 'Aplicar y desactivar' })).toBeDisabled();

    await userEvent.click(within(dialogo).getByLabelText(/Moverlas a la bandeja sin asignar/));
    // No hay otro coordinador activo: la única salida es dejarlos sin coordinador.
    expect(within(dialogo).getByLabelText(/Pasarlos a otro coordinador/)).toBeDisabled();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Aplicar y desactivar' }));

    await waitFor(() =>
      expect(mockEstado).toHaveBeenLastCalledWith('u-carla', {
        activo: false,
        conversaciones: { accion: 'desasignar' },
        equipo: { accion: 'liberar' },
      }),
    );
  });
});
