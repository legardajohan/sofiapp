import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AsignacionDialog } from './AsignacionDialog.js';
import type { AsesorMetricasDTO } from '../types.js';

const { mockFetchMetricas } = vi.hoisted(() => ({ mockFetchMetricas: vi.fn() }));

vi.mock('../api.js', () => ({
  fetchHandoffSettings: vi.fn(),
  saveHandoffSettings: vi.fn(),
  fetchAsesorMetricas: mockFetchMetricas,
}));

function fila(nombre: string, activas: number, pagado = 0): AsesorMetricasDTO {
  return {
    asesorId: nombre,
    nombre,
    activas,
    porEstado: {
      nuevo: activas,
      en_gestion: 0,
      pago_pendiente: 0,
      pagado,
      perdido: 0,
    },
  };
}

function renderDialog(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AsignacionDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('AsignacionDialog (HU-IA-07)', () => {
  beforeEach(() => {
    mockFetchMetricas.mockReset();
  });

  // El orden es información: quien abre esto busca al saturado, y ponerlo primero es la respuesta.
  it('ordena por conversaciones activas, de mayor a menor', async () => {
    mockFetchMetricas.mockResolvedValue([fila('Carlos Mera', 3), fila('Ana Ruiz', 18)]);
    renderDialog();

    const filas = await screen.findAllByRole('row');
    // La primera es la cabecera.
    expect(filas[1]).toHaveTextContent('Ana Ruiz');
    expect(filas[2]).toHaveTextContent('Carlos Mera');
  });

  it('muestra las pagadas como métrica de desempeño', async () => {
    mockFetchMetricas.mockResolvedValue([fila('Ana Ruiz', 2, 27)]);
    renderDialog();

    expect(await screen.findByText('27')).toBeInTheDocument();
  });

  it('dice que son totales, sin rango de fechas', async () => {
    mockFetchMetricas.mockResolvedValue([fila('Ana Ruiz', 2)]);
    renderDialog();

    expect(await screen.findByText(/sin rango de fechas/i)).toBeInTheDocument();
  });

  // AC22
  it('mientras carga anuncia que está ocupado', () => {
    mockFetchMetricas.mockReturnValue(new Promise(() => {}));
    renderDialog();

    expect(screen.getByRole('dialog').querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('sin asesores activos invita a dar de alta a alguien (AC22)', async () => {
    mockFetchMetricas.mockResolvedValue([]);
    renderDialog();

    expect(await screen.findByText(/todavía no hay asesores activos/i)).toBeInTheDocument();
  });

  it('si falla ofrece reintentar en vez de quedarse en blanco (AC22)', async () => {
    mockFetchMetricas.mockRejectedValue(new Error('500'));
    renderDialog();

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo cargar/i);
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
  });
});
