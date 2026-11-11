import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { UsersPage } from './UsersPage.js';
import { deleteUser, fetchCupoUsuarios, fetchManageUsers, fetchTenantUsers, setUserEstado } from '../api.js';
import { useAuthStore } from '@/stores/authStore';
import type { AccionesUsuario, ManageUsersFilters, UserDTO } from '../types.js';

vi.mock('../api.js', () => ({
  fetchManageUsers: vi.fn(),
  fetchTenantUsers: vi.fn(),
  fetchCupoUsuarios: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  setUserEstado: vi.fn(),
  deleteUser: vi.fn(),
  resetUserPassword: vi.fn(),
  changeOwnPassword: vi.fn(),
}));

const mockManage = vi.mocked(fetchManageUsers);
const mockActivos = vi.mocked(fetchTenantUsers);
const mockEstado = vi.mocked(setUserEstado);
const mockEliminar = vi.mocked(deleteUser);
const mockCupo = vi.mocked(fetchCupoUsuarios);

const TODAS: AccionesUsuario = { editar: true, contrasena: true, estado: true, eliminar: true };
const NINGUNA: AccionesUsuario = { editar: false, contrasena: false, estado: false, eliminar: false };

const base = {
  tenantId: 't1',
  rol: 'admin' as const,
  activo: true,
  coordinadorId: null,
  esPrincipal: false,
  puedeGestionarAdministradores: false,
  acciones: TODAS,
};
const ANA: UserDTO = {
  ...base, id: 'u-ana', nombre: 'Ana Admin', email: 'a@t.com', rolEmpresa: 'administrador', esPrincipal: true, acciones: NINGUNA,
};
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

async function elegirAccion(nombre: string, accion: string): Promise<void> {
  await userEvent.click(await screen.findByLabelText(`Acciones para ${nombre}`));
  await userEvent.click(await screen.findByRole('menuitem', { name: accion }));
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: { sub: ANA.id, rol: 'admin', rolEmpresa: 'administrador', esPrincipal: true },
    status: 'authenticated',
  });
  mockManage.mockImplementation(async (f: ManageUsersFilters) =>
    f.rolEmpresa === 'coordinador' ? [CARLA] : TODOS,
  );
  mockActivos.mockResolvedValue(TODOS);
  mockCupo.mockResolvedValue({
    usuarios: { usado: 4, limite: 10 },
    administradores: { usado: 1, limite: 2 },
  });
});

describe('UsersPage — AUTH-03 / AUTH-04 / AUTH-05', () => {
  it('en la propia fila solo ofrece cambiar mi contraseña', async () => {
    renderPage();
    await userEvent.click(await screen.findByLabelText('Acciones para Ana Admin'));
    expect(await screen.findByRole('menuitem', { name: 'Cambiar mi contraseña' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Desactivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('marca al principal y muestra el uso del plan', async () => {
    renderPage();
    const fila = (await screen.findByText('Ana Admin')).closest('tr') as HTMLElement;
    expect(within(fila).getByText('Principal')).toBeInTheDocument();
    expect(await screen.findByText('4 de 10')).toBeInTheDocument();
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
  });

  it('una fila sin acciones permitidas no muestra menú', async () => {
    useAuthStore.setState({
      user: { sub: 'u-otro', rol: 'admin', rolEmpresa: 'administrador' },
      status: 'authenticated',
    });
    mockManage.mockResolvedValue([{ ...ANA, acciones: NINGUNA }, BEA]);
    renderPage();
    expect(await screen.findByText('Ana Admin')).toBeInTheDocument();
    expect(screen.queryByLabelText('Acciones para Ana Admin')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Acciones para Bea')).toBeInTheDocument();
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

  it('el principal ofrece el permiso de gestionar administradores al crear un Administrador', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Crear usuario' }));
    const roles = await screen.findByRole('radiogroup', { name: 'Rol en la empresa' });
    await userEvent.click(within(roles).getByLabelText(/^Administrador/));
    expect(await screen.findByLabelText('Puede gestionar a otros administradores')).toBeInTheDocument();
  });

  it('un administrador sin permiso no ofrece crear administradores', async () => {
    useAuthStore.setState({
      user: { sub: 'u-otro', rol: 'admin', rolEmpresa: 'administrador' },
      status: 'authenticated',
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Crear usuario' }));
    const roles = await screen.findByRole('radiogroup', { name: 'Rol en la empresa' });
    expect(within(roles).queryByLabelText(/^Administrador/)).not.toBeInTheDocument();
    expect(within(roles).getByLabelText(/^Coordinador/)).toBeInTheDocument();
  });

  it('el coordinador ve "Mi equipo", filtra por equipo y elige el coordinador del asesor', async () => {
    useAuthStore.setState({ user: { sub: CARLA.id, rol: 'admin', rolEmpresa: 'coordinador' }, status: 'authenticated' });
    mockManage.mockResolvedValue([ANDRES, BEA]);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Mi equipo' })).toBeInTheDocument();
    expect(await screen.findByText('Bea')).toBeInTheDocument();
    expect(screen.queryByLabelText('Filtrar por rol')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Filtrar por equipo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Crear asesor' }));
    // Un solo rol posible: no hay radio de rol, pero sí el selector de coordinador.
    expect(await screen.findByRole('heading', { name: 'Crear asesor' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Rol en la empresa' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Coordinador')).toBeInTheDocument();
  });

  it('sin dependencias desactiva al confirmar', async () => {
    mockEstado.mockResolvedValue({ ...BEA, activo: false });
    renderPage();
    await elegirAccion('Bea', 'Desactivar');
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(mockEstado).toHaveBeenCalledWith('u-bea', { activo: false }));
  });

  it('eliminar pide confirmación y resuelve el 409 igual que la desactivación', async () => {
    mockEliminar
      .mockRejectedValueOnce(dependencias409({ asignadas: 2, flujos: 0, asesores: 0 }))
      .mockResolvedValueOnce({ ...BEA, activo: false });
    renderPage();
    await elegirAccion('Bea', 'Eliminar');
    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText(/No se puede deshacer/)).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));
    expect(await within(dialogo).findByText(/Decide qué pasa antes de eliminarlo/)).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByLabelText(/Moverlas a la bandeja sin asignar/));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Aplicar y eliminar' }));
    await waitFor(() =>
      expect(mockEliminar).toHaveBeenLastCalledWith('u-bea', { conversaciones: { accion: 'desasignar' } }),
    );
  });

  it('ante el 409 de un coordinador resuelve conversaciones y equipo en un mismo paso', async () => {
    mockEstado
      .mockRejectedValueOnce(dependencias409({ asignadas: 3, flujos: 1, asesores: 2 }))
      .mockResolvedValueOnce({ ...CARLA, activo: false });
    renderPage();
    await elegirAccion('Carla', 'Desactivar');
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
