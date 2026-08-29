import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SemaforosDialog } from './SemaforosDialog.js';
import { createSemaforo, fetchSemaforos, updateSemaforo } from '@/features/semaforos/api';

vi.mock('@/features/semaforos/api', () => ({
  fetchSemaforos: vi.fn(),
  createSemaforo: vi.fn(),
  updateSemaforo: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockFetch = vi.mocked(fetchSemaforos);
const mockCreate = vi.mocked(createSemaforo);
const mockUpdate = vi.mocked(updateSemaforo);

const CATALOGO = [
  {
    id: 's1',
    key: 'verde',
    label: 'Venta concretada',
    color: '#16A34A',
    orden: 2,
    activo: true,
    esDefecto: true,
  },
  {
    id: 's2',
    key: 'tibio',
    label: 'Tibio',
    color: '#CA8A04',
    orden: 4,
    activo: true,
    esDefecto: false,
  },
];

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <SemaforosDialog />
    </QueryClientProvider>,
  );
}

async function abrir(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Semáforos' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue(CATALOGO);
});

describe('SemaforosDialog', () => {
  it('lista el catálogo de la empresa', async () => {
    renderDialog();
    await abrir();

    expect(await screen.findByText('Venta concretada')).toBeInTheDocument();
    expect(screen.getByText('Tibio')).toBeInTheDocument();
  });

  it('crea uno propio con su nombre y su color', async () => {
    mockCreate.mockResolvedValue({ ...CATALOGO[1]!, label: 'Muy interesado' });
    renderDialog();
    await abrir();
    await screen.findByText('Tibio');

    await userEvent.type(screen.getByPlaceholderText('Tibio'), 'Muy interesado');
    await userEvent.click(screen.getByRole('button', { name: /Crear/ }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({ label: 'Muy interesado', color: '#475569' }),
    );
  });

  it('no deja crear uno sin nombre', async () => {
    renderDialog();
    await abrir();
    await screen.findByText('Tibio');

    expect(screen.getByRole('button', { name: /Crear/ })).toBeDisabled();
  });

  it('renombrar manda el cambio por el id, sin tocar la clave', async () => {
    mockUpdate.mockResolvedValue({ ...CATALOGO[1]!, label: 'Templado' });
    renderDialog();
    await abrir();
    await screen.findByText('Tibio');

    await userEvent.click(screen.getByRole('button', { name: 'Editar Tibio' }));
    const campo = screen.getByRole('textbox', { name: 'Nombre de Tibio' });
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Templado');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('s2', { label: 'Templado', color: '#CA8A04' }),
    );
  });

  it('cancelar la edición descarta lo tecleado en vez de heredarlo', async () => {
    renderDialog();
    await abrir();
    await screen.findByText('Tibio');

    await userEvent.click(screen.getByRole('button', { name: 'Editar Tibio' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre de Tibio' }), 'XXX');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Tibio')).toBeInTheDocument();
  });

  it('archiva uno propio', async () => {
    mockUpdate.mockResolvedValue({ ...CATALOGO[1]!, activo: false });
    renderDialog();
    await abrir();
    await screen.findByText('Tibio');

    await userEvent.click(screen.getByRole('button', { name: 'Archivar Tibio' }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('s2', { activo: false }));
  });

  it('NO ofrece archivar los cuatro base: su clave la comparte el resto del CRM', async () => {
    renderDialog();
    await abrir();
    await screen.findByText('Venta concretada');

    // Un botón que siempre respondería 409 es peor que ningún botón; se explica en su lugar.
    expect(
      screen.queryByRole('button', { name: 'Archivar Venta concretada' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/no se archivan/)).toBeInTheDocument();
  });

  it('si falla la carga, lo dice y ofrece reintentar', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));
    renderDialog();
    await abrir();

    expect(await screen.findByText(/No se pudo cargar el catálogo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
