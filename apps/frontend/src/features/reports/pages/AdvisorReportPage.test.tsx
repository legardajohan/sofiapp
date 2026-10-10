import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AdvisorReportPage } from './AdvisorReportPage.js';
import { getAdvisorReport } from '../../../api/reports.js';
import type { AdvisorReport, AdvisorRow } from '../types/index.js';

vi.mock('../../../api/reports.js', () => ({ getAdvisorReport: vi.fn() }));

const mockGet = vi.mocked(getAdvisorReport);

function fila(nombre: string, atendidas: number, ventas: number, activo = true): AdvisorRow {
  return {
    asesorId: `id-${nombre}`,
    nombre,
    activo,
    conversacionesAtendidas: atendidas,
    asignadasActivas: atendidas + 2,
    ventas,
    tasaCierre: atendidas ? ventas / atendidas : 0,
  };
}

function reporte(filas: AdvisorRow[], sinAsignar = { conversacionesAtendidas: 0, ventas: 0 }): AdvisorReport {
  const atendidas = filas.reduce((s, f) => s + f.conversacionesAtendidas, 0) + sinAsignar.conversacionesAtendidas;
  const ventas = filas.reduce((s, f) => s + f.ventas, 0) + sinAsignar.ventas;
  return {
    generadoAt: '2026-10-08T15:00:00.000Z',
    rango: { desde: '2026-09-09T00:00:00.000Z', hasta: '2026-10-08T23:59:59.999Z' },
    totales: {
      asesores: filas.length,
      conversacionesAtendidas: atendidas,
      asignadasActivas: filas.reduce((s, f) => s + f.asignadasActivas, 0),
      ventas,
      tasaCierre: atendidas ? ventas / atendidas : 0,
    },
    porAsesor: filas,
    sinAsignar,
  };
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/reports/advisors']}>
        <AdvisorReportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdvisorReportPage — HU-REP-01', () => {
  it('pide los últimos 30 días por defecto y muestra totales, filas y "sin asignar"', async () => {
    mockGet.mockResolvedValue(reporte([fila('Laura', 120, 14), fila('Pedro', 40, 2, false)], { conversacionesAtendidas: 9, ventas: 1 }));
    renderPage();

    // La tabla existe desde el skeleton: se espera al dato, no a la tabla.
    await screen.findByText('Laura');
    const tabla = screen.getByRole('table');
    expect(within(tabla).getByText('Inactivo')).toBeInTheDocument();
    expect(within(tabla).getByText('Sin asesor asignado')).toBeInTheDocument();
    // La abreviatura del mes depende del ICU (sep / sept. …): se fija el día y el año, leídos en UTC.
    expect(screen.getByText(/^Del 9 (de )?\S+ al 8 (de )?\S+ (de )?2026$/)).toBeInTheDocument();
    expect(screen.getAllByText('169').length).toBeGreaterThan(0); // 120 + 40 + 9 atendidas

    const params = mockGet.mock.calls[0]?.[0];
    expect(params?.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params?.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('ordena la tabla al pulsar una columna', async () => {
    mockGet.mockResolvedValue(reporte([fila('Laura', 120, 1), fila('Pedro', 40, 9)]));
    renderPage();
    await screen.findByText('Laura');
    const tabla = screen.getByRole('table');

    await userEvent.click(within(tabla).getByRole('button', { name: /^Ventas/ }));

    await waitFor(() => {
      const primeras = within(tabla).getAllByRole('row').slice(1, 3).map((r) => r.textContent ?? '');
      expect(primeras[0]).toContain('Pedro');
      expect(primeras[1]).toContain('Laura');
    });
  });

  it('con error ofrece reintentar', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText('No pudimos cargar el reporte')).toBeInTheDocument();
    mockGet.mockResolvedValue(reporte([]));
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText('Tu empresa aún no tiene asesores con cuenta en el panel.')).toBeInTheDocument();
  });
});
