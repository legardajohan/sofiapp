import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeadHistorialSemaforo } from './LeadHistorialSemaforo.js';
import { fetchHistorialSemaforo } from '../api.js';
import type { SemaforoDTO } from '../../semaforos/types.js';

vi.mock('../api.js', () => ({ fetchHistorialSemaforo: vi.fn() }));

const mockFetch = vi.mocked(fetchHistorialSemaforo);

const CATALOGO: SemaforoDTO[] = [
  {
    id: 's1',
    key: 'azul',
    label: 'Frío',
    color: '#2563EB',
    orden: 0,
    activo: true,
    esDefecto: true,
  },
  {
    id: 's2',
    key: 'verde',
    label: 'Venta concretada',
    color: '#16A34A',
    orden: 2,
    activo: true,
    esDefecto: true,
  },
];

function renderHistorial() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <LeadHistorialSemaforo leadId="l1" semaforos={CATALOGO} />
    </QueryClientProvider>,
  );
}

async function abrir(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: /historial del semáforo/i }));
}

beforeEach(() => vi.clearAllMocks());

describe('LeadHistorialSemaforo', () => {
  it('cerrado NO consulta: no le cuesta una petición a quien nunca lo abre', () => {
    mockFetch.mockResolvedValue({ data: [], page: 1, limit: 20, total: 0 });
    renderHistorial();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('al abrirlo lista los cambios con su etiqueta y su autor', async () => {
    mockFetch.mockResolvedValue({
      data: [
        {
          id: 'h1',
          de: 'azul',
          a: 'verde',
          actor: { id: 'u1', nombre: 'Carolina' },
          at: '2026-08-20T10:00:00.000Z',
        },
      ],
      page: 1,
      limit: 20,
      total: 1,
    });

    renderHistorial();
    await abrir();

    expect(await screen.findByText('Frío')).toBeInTheDocument();
    expect(screen.getByText('Venta concretada')).toBeInTheDocument();
    expect(screen.getByText(/Carolina/)).toBeInTheDocument();
  });

  it('el primer cambio de un lead se lee como «Sin clasificar → …»', async () => {
    mockFetch.mockResolvedValue({
      data: [
        {
          id: 'h1',
          de: null,
          a: 'verde',
          actor: { id: 'u1', nombre: 'Carolina' },
          at: '2026-08-20T10:00:00.000Z',
        },
      ],
      page: 1,
      limit: 20,
      total: 1,
    });

    renderHistorial();
    await abrir();

    expect(await screen.findByText('Sin clasificar')).toBeInTheDocument();
  });

  it('una clave que ya no está en el catálogo se pinta cruda, no como un hueco', async () => {
    mockFetch.mockResolvedValue({
      data: [
        {
          id: 'h1',
          de: 'fantasma',
          a: 'verde',
          actor: null,
          at: '2026-08-20T10:00:00.000Z',
        },
      ],
      page: 1,
      limit: 20,
      total: 1,
    });

    renderHistorial();
    await abrir();

    // El cambio ocurrió: esconderlo sería mentir sobre el historial.
    expect(await screen.findByText('fantasma')).toBeInTheDocument();
  });

  it('sin cambios explica para qué sirve la sección en vez de dejar un hueco', async () => {
    mockFetch.mockResolvedValue({ data: [], page: 1, limit: 20, total: 0 });

    renderHistorial();
    await abrir();

    expect(await screen.findByText(/Todavía no se ha cambiado el semáforo/)).toBeInTheDocument();
  });

  it('si falla, lo dice y ofrece reintentar', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));

    renderHistorial();
    await abrir();

    expect(await screen.findByText(/No se pudo cargar el historial/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
