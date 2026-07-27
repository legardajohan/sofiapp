import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InboxFilters } from './InboxFilters.js';
import { fetchTags } from '@/features/tags/api';
import { fetchTenantUsers } from '@/features/users/api';
import type { TagDTO } from '@/features/tags/types';

vi.mock('@/features/tags/api', () => ({
  fetchTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

vi.mock('@/features/users/api', () => ({
  fetchTenantUsers: vi.fn(),
}));

const mockFetchTags = vi.mocked(fetchTags);
const mockGetUsers = vi.mocked(fetchTenantUsers);

const URGENTE: TagDTO = { id: 't1', nombre: 'Urgente', color: '#DC2626', semaforo: null };
const VERDE: TagDTO = { id: 't2', nombre: 'Avanza', color: '#16A34A', semaforo: 'verde' };

function renderFilters(etiqueta?: string): { onEtiquetaChange: ReturnType<typeof vi.fn> } {
  const onEtiquetaChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <InboxFilters
        value="todos"
        onChange={vi.fn()}
        onAsignadoAChange={vi.fn()}
        onEstadoChange={vi.fn()}
        etiqueta={etiqueta}
        onEtiquetaChange={onEtiquetaChange}
      />
    </QueryClientProvider>,
  );
  return { onEtiquetaChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchTags.mockResolvedValue([URGENTE, VERDE]);
  mockGetUsers.mockResolvedValue([]);
});

describe('InboxFilters — filtro por etiqueta', () => {
  it('elegir una etiqueta la propaga por su id', async () => {
    const { onEtiquetaChange } = renderFilters();

    await userEvent.click(await screen.findByRole('combobox', { name: /etiqueta/i }));
    await userEvent.click(await screen.findByRole('option', { name: /Urgente/ }));

    expect(onEtiquetaChange).toHaveBeenCalledWith('t1');
  });

  it('"Todas las etiquetas" limpia el filtro en vez de mandar un valor centinela', async () => {
    const { onEtiquetaChange } = renderFilters('t1');

    await userEvent.click(await screen.findByRole('combobox', { name: /etiqueta/i }));
    await userEvent.click(await screen.findByRole('option', { name: /Todas las etiquetas/ }));

    // `undefined`, no '__todos__': el query param debe desaparecer de la URL.
    expect(onEtiquetaChange).toHaveBeenCalledWith(undefined);
  });

  it('sin etiquetas creadas, el filtro no se muestra', async () => {
    mockFetchTags.mockResolvedValue([]);
    renderFilters();

    // Los otros dos filtros siguen ahí; el de etiqueta no aparece porque no podría filtrar nada.
    expect(await screen.findByRole('combobox', { name: /responsable/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /etiqueta/i })).not.toBeInTheDocument();
  });
});
