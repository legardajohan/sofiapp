import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeadsFilters } from './LeadsFilters.js';
import { fetchTags } from '@/features/tags/api';
import { fetchTenantUsers } from '@/features/users/api';
import { fetchEstados } from '@/features/estados/api';
import type { LeadsFiltros } from '../types.js';

vi.mock('@/features/tags/api', () => ({
  fetchTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

vi.mock('@/features/users/api', () => ({
  fetchTenantUsers: vi.fn(),
}));

vi.mock('@/features/estados/api', () => ({
  fetchEstados: vi.fn(),
  createEstado: vi.fn(),
}));

const mockFetchTags = vi.mocked(fetchTags);
const mockFetchUsers = vi.mocked(fetchTenantUsers);
const mockFetchEstados = vi.mocked(fetchEstados);

function renderFilters(filtros: Partial<LeadsFiltros> = {}) {
  const onChange = vi.fn();
  const onClear = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <LeadsFilters filtros={{ page: 1, ...filtros }} onChange={onChange} onClear={onClear} />
    </QueryClientProvider>,
  );

  return { onChange, onClear };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchEstados.mockResolvedValue([
    { id: 'e1', key: 'nuevo', label: 'Nuevo', color: '#64748B', orden: 0, activo: true, esDefecto: true },
    { id: 'e2', key: 'pagado', label: 'Pagado', color: '#16A34A', orden: 3, activo: true, esDefecto: true },
    // Archivado: sigue existiendo pero no debe ofrecerse para filtrar.
    { id: 'e3', key: 'antiguo', label: 'Antiguo', color: '#475569', orden: 9, activo: false, esDefecto: false },
  ]);
  mockFetchTags.mockResolvedValue([
    { id: 't1', nombre: 'Avanza', color: '#16A34A', semaforo: 'verde' },
    { id: 't2', nombre: 'En riesgo', color: '#DC2626', semaforo: 'rojo' },
  ]);
  mockFetchUsers.mockResolvedValue([
    {
      id: 'u1',
      tenantId: 'te1',
      nombre: 'Carolina',
      email: 'carolina@empresa.test',
      rol: 'admin',
      activo: true,
    },
  ]);
});

describe('LeadsFilters', () => {
  it('elegir un estado lo propaga por su clave de dominio', async () => {
    const { onChange } = renderFilters();

    await userEvent.click(screen.getByRole('combobox', { name: 'Estado' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Pagado' }));

    expect(onChange).toHaveBeenCalledWith({ estado: 'pagado' });
  });

  it('los estados salen del catálogo del tenant y los archivados no se ofrecen', async () => {
    renderFilters();

    await userEvent.click(screen.getByRole('combobox', { name: /estado/i }));

    // Del catálogo, no de una constante del código.
    expect(await screen.findByRole('option', { name: 'Nuevo' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Pagado' })).toBeInTheDocument();
    // Archivado: sigue resolviendo su etiqueta en los leads que lo llevan, pero no se filtra por él.
    expect(screen.queryByRole('option', { name: 'Antiguo' })).not.toBeInTheDocument();
  });

  it('volver a "todos los estados" quita el filtro en vez de mandar el centinela', async () => {
    const { onChange } = renderFilters({ estado: 'pagado' });

    await userEvent.click(screen.getByRole('combobox', { name: 'Estado' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Todos los estados' }));

    expect(onChange).toHaveBeenCalledWith({ estado: undefined });
  });

  it('el semáforo se ofrece con el nombre que el tenant le puso, no con el slug', async () => {
    const { onChange } = renderFilters();

    await userEvent.click(screen.getByRole('combobox', { name: 'Semáforo' }));
    // "Avanza" es el nombre sembrado y editable; el valor que viaja es el slug estable.
    await userEvent.click(await screen.findByRole('option', { name: /Avanza/ }));

    expect(onChange).toHaveBeenCalledWith({ semaforo: 'verde' });
  });

  it('el responsable se elige por su id', async () => {
    const { onChange } = renderFilters();

    await userEvent.click(screen.getByRole('combobox', { name: 'Responsable' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Carolina' }));

    expect(onChange).toHaveBeenCalledWith({ asesor: 'u1' });
  });

  it('un preset de fecha calcula el rango y no obliga a teclear nada', async () => {
    const { onChange } = renderFilters();

    await userEvent.click(screen.getByRole('combobox', { name: 'Fecha de creación' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Hoy' }));

    const cambio = onChange.mock.calls[0]?.[0] as { desde?: string; hasta?: string };
    expect(cambio.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // "Hoy" es un rango de un solo día: ambos extremos coinciden.
    expect(cambio.desde).toBe(cambio.hasta);
  });

  it('elegir "Personalizado" abre los dos campos aunque todavía no haya fechas', async () => {
    // El bug: "Personalizado" no se deduce de las fechas, y sin fechas puestas el selector volvía
    // a "Cualquier fecha" — elegirlo no hacía absolutamente nada visible.
    renderFilters();

    await userEvent.click(screen.getByRole('combobox', { name: /fecha de creación/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Personalizado' }));

    expect(await screen.findByLabelText('Desde')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toBeInTheDocument();
  });

  it('elegir "Personalizado" no filtra todavía: no hay rango que aplicar', async () => {
    const { onChange } = renderFilters();

    await userEvent.click(screen.getByRole('combobox', { name: /fecha de creación/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Personalizado' }));

    // Emitir aquí resetearía la paginación por un clic que aún no ha filtrado nada.
    expect(onChange).not.toHaveBeenCalled();
  });
  it('los campos de fecha libre solo aparecen en "Personalizado"', async () => {
    renderFilters();
    expect(screen.queryByLabelText('Desde')).not.toBeInTheDocument();

    // Un rango que no casa con ningún preset ES personalizado: si el selector dijera
    // "cualquier fecha" mentiría sobre lo que se está viendo.
    renderFilters({ desde: '2026-01-01', hasta: '2026-03-15' });
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-03-15');
  });

  it('"Limpiar filtros" solo se ofrece cuando hay alguno activo', async () => {
    const sinFiltros = renderFilters();
    expect(screen.queryByRole('button', { name: /Limpiar filtros/ })).not.toBeInTheDocument();
    expect(sinFiltros.onClear).not.toHaveBeenCalled();

    const conFiltros = renderFilters({ estado: 'nuevo' });
    await userEvent.click(screen.getByRole('button', { name: /Limpiar filtros/ }));
    expect(conFiltros.onClear).toHaveBeenCalled();
  });
});
