import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { LeadsPage } from './LeadsPage.js';
import { fetchLeads } from '../api.js';
import { fetchPipeline } from '../../pipeline/api.js';
import { fetchEstados } from '../../estados/api.js';
import { useLeadsStore } from '../useLeadsStore.js';

vi.mock('../api.js', () => ({
  fetchLeads: vi.fn(),
  fetchLead: vi.fn(),
  createLead: vi.fn(),
  deleteLead: vi.fn(),
  updateLeadEstado: vi.fn(),
}));

vi.mock('../../pipeline/api.js', () => ({
  fetchPipeline: vi.fn(),
  moveLeadStage: vi.fn(),
}));

vi.mock('../../estados/api.js', () => ({
  fetchEstados: vi.fn(),
  createEstado: vi.fn(),
}));

vi.mock('../../users/hooks/useTenantUsers.js', () => ({
  useTenantUsers: () => ({ data: [], isLoading: false }),
}));

// La barra de filtros también pide las etiquetas; sin mock, jsdom intenta una petición real.
vi.mock('../../tags/hooks/useTags.js', () => ({
  useTags: () => ({ data: [], isLoading: false }),
}));

// El tablero abre un socket real al montarse; en el test solo interesa qué vista se pinta.
vi.mock('../../../lib/socket.js', () => ({
  getSocket: () => ({ on: vi.fn(), off: vi.fn() }),
  disconnectSocket: vi.fn(),
}));

const etapa = {
  id: 'e1',
  key: 'nuevo',
  label: 'Nuevo',
  color: '#64748B',
  orden: 0,
  activo: true,
  esDefecto: true,
  esSalida: false,
};

/** Espía la URL, que es donde vive la vista para poder compartirse por enlace. */
function UrlActual(): React.ReactElement {
  const { search } = useLocation();
  return <span data-testid="url">{search}</span>;
}

function pintar(initial = '/leads'): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initial]}>
        <LeadsPage />
        <UrlActual />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useLeadsStore.setState({ selectedId: null });

  vi.mocked(fetchEstados).mockResolvedValue([etapa]);
  vi.mocked(fetchLeads).mockResolvedValue({ data: [], page: 1, limit: 20, total: 0 });
  vi.mocked(fetchPipeline).mockResolvedValue({
    columnas: [{ etapa, total: 0, leads: [] }],
    limit: 20,
  });
});

describe('HU-PIPE-01 — las dos vistas de la cartera', () => {
  it('arranca en la tabla', async () => {
    pintar();

    await waitFor(() => expect(fetchLeads).toHaveBeenCalled());
    expect(fetchPipeline).not.toHaveBeenCalled();
  });

  it('cambiar a Embudo pinta el tablero y lo deja escrito en la URL', async () => {
    pintar();

    await userEvent.click(screen.getByRole('tab', { name: 'Embudo' }));

    await waitFor(() => expect(fetchPipeline).toHaveBeenCalled());
    expect(screen.getByTestId('url').textContent).toContain('vista=embudo');
  });

  it('`?vista=embudo` en la URL abre el tablero directo: la vista se comparte por enlace', async () => {
    pintar('/leads?vista=embudo');

    await waitFor(() => expect(fetchPipeline).toHaveBeenCalled());
    expect(fetchLeads).not.toHaveBeenCalled();
  });

  it('conserva los filtros al cambiar de vista: es la misma cartera', async () => {
    pintar('/leads?asesor=507f1f77bcf86cd799439011');

    await userEvent.click(screen.getByRole('tab', { name: 'Embudo' }));

    await waitFor(() => {
      expect(fetchPipeline).toHaveBeenCalledWith(
        expect.objectContaining({ asesor: '507f1f77bcf86cd799439011' }),
      );
    });
    expect(screen.getByTestId('url').textContent).toContain('asesor=');
  });

  it('al pasar al embudo suelta `estado`, que el tablero no admite', async () => {
    // El tablero agrupa por etapa; mandar `?estado=` sería un 400 del backend.
    pintar('/leads?estado=nuevo');

    await userEvent.click(screen.getByRole('tab', { name: 'Embudo' }));

    await waitFor(() => expect(fetchPipeline).toHaveBeenCalled());
    expect(screen.getByTestId('url').textContent).not.toContain('estado=');
  });

  it('volver a la tabla quita `vista` de la URL', async () => {
    pintar('/leads?vista=embudo');

    await userEvent.click(screen.getByRole('tab', { name: 'Tabla' }));

    await waitFor(() => expect(fetchLeads).toHaveBeenCalled());
    expect(screen.getByTestId('url').textContent).not.toContain('vista=');
  });
});
