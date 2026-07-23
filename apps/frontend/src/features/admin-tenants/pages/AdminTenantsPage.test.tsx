import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminTenantsPage } from './AdminTenantsPage.js';
import { getAdminTenants } from '../../../api/admin-tenants.js';
import { useAdminTenantsStore } from '../useAdminTenantsStore.js';
import type { ITenant, TenantsListResponse } from '../types/index.js';

// Mockeamos la capa de API para no tocar red ni el apiClient real.
vi.mock('../../../api/admin-tenants.js', () => ({
  getAdminTenants: vi.fn(),
  createAdminTenant: vi.fn(),
  updateAdminTenant: vi.fn(),
  updateAdminTenantStatus: vi.fn(),
  deleteAdminTenant: vi.fn(),
  assignTenantPlan: vi.fn(),
  getTenantUsage: vi.fn(),
}));

vi.mock('../../../api/admin-plans.js', () => ({
  getAdminPlans: vi.fn(() => Promise.resolve([])),
}));

const mockGetAdminTenants = vi.mocked(getAdminTenants);

function makeTenant(nombre: string, slug: string): ITenant {
  return {
    _id: `id-${slug}`,
    nombre,
    slug,
    contacto: { email: `${slug}@example.com`, telefono: '3001234567' },
    estado: 'activo',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function listResponse(tenants: ITenant[]): TenantsListResponse {
  return { data: tenants, total: tenants.length, page: 1, limit: 20 };
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AdminTenantsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reinicia el store de Zustand entre tests (es un singleton de módulo).
  useAdminTenantsStore.setState({
    searchTerm: '',
    currentPage: 1,
    isModalOpen: false,
    tenantEditing: null,
  });
  mockGetAdminTenants.mockResolvedValue(listResponse([makeTenant('Acme Corp', 'acme')]));
});

describe('AdminTenantsPage — buscador de empresas', () => {
  it('no lanza la búsqueda mientras se teclea (no hay refetch por tecla)', async () => {
    renderPage();
    await screen.findByText('Acme Corp');
    expect(mockGetAdminTenants).toHaveBeenCalledTimes(1);

    const input = screen.getByPlaceholderText('Busca por nombre o slug y presiona enter');
    await userEvent.type(input, 'acme');

    // El texto tecleado no debe disparar peticiones adicionales.
    expect(mockGetAdminTenants).toHaveBeenCalledTimes(1);
    expect(mockGetAdminTenants).toHaveBeenLastCalledWith({ search: undefined, page: 1 });
  });

  it('mantiene el foco y el texto en el input mientras se escribe (regresión: "se sale del buscador")', async () => {
    renderPage();
    await screen.findByText('Acme Corp');

    const input = screen.getByPlaceholderText('Busca por nombre o slug y presiona enter') as HTMLInputElement;
    await userEvent.type(input, 'Empresa X');

    expect(input).toHaveValue('Empresa X');
    expect(input).toHaveFocus();
  });

  it('busca por nombre/slug al presionar Enter', async () => {
    mockGetAdminTenants
      .mockResolvedValueOnce(listResponse([makeTenant('Acme Corp', 'acme'), makeTenant('Beta SA', 'beta')]))
      .mockResolvedValueOnce(listResponse([makeTenant('Beta SA', 'beta')]));

    renderPage();
    await screen.findByText('Acme Corp');

    const input = screen.getByPlaceholderText('Busca por nombre o slug y presiona enter');
    await userEvent.type(input, 'beta{Enter}');

    await waitFor(() => {
      expect(mockGetAdminTenants).toHaveBeenLastCalledWith({ search: 'beta', page: 1 });
    });

    // Tras la búsqueda, el input conserva su valor y el foco (no se desmonta).
    expect(input).toHaveValue('beta');
    expect(input).toHaveFocus();
  });

  it('el botón Buscar dispara la búsqueda con el término tecleado', async () => {
    renderPage();
    await screen.findByText('Acme Corp');

    const input = screen.getByPlaceholderText('Busca por nombre o slug y presiona enter');
    await userEvent.type(input, 'acme');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => {
      expect(mockGetAdminTenants).toHaveBeenLastCalledWith({ search: 'acme', page: 1 });
    });
  });

  it('al vaciar el input (borrar el texto) restaura el listado completo sin Enter', async () => {
    mockGetAdminTenants
      .mockResolvedValueOnce(listResponse([makeTenant('Acme Corp', 'acme'), makeTenant('Beta SA', 'beta')]))
      .mockResolvedValueOnce(listResponse([makeTenant('Beta SA', 'beta')]))
      .mockResolvedValueOnce(listResponse([makeTenant('Acme Corp', 'acme'), makeTenant('Beta SA', 'beta')]));

    renderPage();
    await screen.findByText('Acme Corp');

    const input = screen.getByPlaceholderText('Busca por nombre o slug y presiona enter');
    // Se busca "beta" con Enter…
    await userEvent.type(input, 'beta{Enter}');
    await waitFor(() => {
      expect(mockGetAdminTenants).toHaveBeenLastCalledWith({ search: 'beta', page: 1 });
    });

    // …y al borrar todo el texto se vuelve a listar sin necesidad de presionar Enter.
    await userEvent.clear(input);
    await waitFor(() => {
      expect(mockGetAdminTenants).toHaveBeenLastCalledWith({ search: undefined, page: 1 });
    });
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('limpiar la búsqueda vuelve a listar todas las empresas', async () => {
    useAdminTenantsStore.setState({ searchTerm: 'beta' });
    renderPage();
    await screen.findByText('Acme Corp');

    // Con un término activo aparece el aviso de resultados y el botón "Ver todas".
    await userEvent.click(screen.getByRole('button', { name: 'Ver todas' }));

    await waitFor(() => {
      expect(mockGetAdminTenants).toHaveBeenLastCalledWith({ search: undefined, page: 1 });
    });
  });
});
