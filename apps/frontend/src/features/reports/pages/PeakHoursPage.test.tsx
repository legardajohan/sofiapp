import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PeakHoursPage } from './PeakHoursPage.js';
import { getPeakHours } from '../../../api/reports.js';
import type { PeakHours } from '../types/index.js';

vi.mock('../../../api/reports.js', () => ({ getPeakHours: vi.fn() }));

const mockGet = vi.mocked(getPeakHours);

/** Reporte con `entrantes` por hora (el resto en 0) y 10 días. */
function reporte(entrantesPorHora: Record<number, number> = { 10: 300, 15: 100 }): PeakHours {
  const porHora = Array.from({ length: 24 }, (_, hora) => {
    const entrantes = entrantesPorHora[hora] ?? 0;
    return { hora, entrantes, salientes: entrantes, total: entrantes * 2 };
  });
  const entrantes = porHora.reduce((s, h) => s + h.entrantes, 0);
  const porDia = Array.from({ length: 10 }, (_, i) => ({
    fecha: `2026-09-${String(i + 1).padStart(2, '0')}`,
    entrantes: i === 3 ? entrantes : 0,
    salientes: i === 3 ? entrantes : 0,
    total: i === 3 ? entrantes * 2 : 0,
  }));
  const picoHora = porHora.reduce((m, h) => (h.entrantes > m.entrantes ? h : m), porHora[0]!);
  return {
    generadoAt: '2026-10-09T15:00:00.000Z',
    rango: { desde: '2026-09-01T00:00:00.000Z', hasta: '2026-09-10T23:59:59.999Z' },
    timezone: 'America/Bogota',
    totales: { mensajes: entrantes * 2, entrantes, salientes: entrantes },
    porHora,
    porDia,
    pico: entrantes ? { hora: picoHora.hora, entrantes: picoHora.entrantes } : null,
    diaPico: entrantes ? { fecha: '2026-09-04', entrantes } : null,
  };
}

function renderPage(entry = '/reports/peak-hours'): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <PeakHoursPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PeakHoursPage — HU-REP-04', () => {
  it('pinta la hora pico, los KPIs y la zona horaria', async () => {
    mockGet.mockResolvedValue(reporte());
    renderPage();

    expect(await screen.findByText('Hora pico')).toBeInTheDocument();
    expect(screen.getByText('10:00–11:00')).toBeInTheDocument();
    expect(screen.getByText(/^300 recibidos, 75[,.]0\s?% del total$/)).toBeInTheDocument();
    expect(screen.getAllByText('400').length).toBeGreaterThan(0); // recibidos y día de más demanda
    expect(screen.getByText('40')).toBeInTheDocument(); // promedio: 400 / 10 días
    expect(screen.getByText(/Horas en tu zona: America\/Bogota/)).toBeInTheDocument();
    expect(screen.getByText('Por hora del día')).toBeInTheDocument();
    expect(screen.getByText('Por día')).toBeInTheDocument();
  });

  it('pide los últimos 30 días con la zona del navegador', async () => {
    mockGet.mockResolvedValue(reporte());
    renderPage();

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const params = mockGet.mock.calls[0]?.[0];
    expect(params?.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params?.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params?.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('el rango de la URL viaja al endpoint junto con la zona', async () => {
    mockGet.mockResolvedValue(reporte());
    renderPage('/reports/peak-hours?periodo=personalizado&desde=2026-09-01&hasta=2026-09-15');

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls.at(-1)?.[0]).toEqual({
      desde: '2026-09-01',
      hasta: '2026-09-15',
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });

  it('sin mensajes muestra el vacío', async () => {
    mockGet.mockResolvedValue(reporte({}));
    renderPage();

    expect(await screen.findAllByText('No hubo mensajes en este periodo.')).toHaveLength(2);
    expect(screen.getByText('Ningún cliente escribió en el periodo')).toBeInTheDocument();
  });

  it('con error ofrece reintentar', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText('No pudimos cargar el reporte')).toBeInTheDocument();
    mockGet.mockResolvedValue(reporte());
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText('10:00–11:00')).toBeInTheDocument();
  });
});
