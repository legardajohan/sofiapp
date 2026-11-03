import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AdvisorReportPage } from './AdvisorReportPage.js';
import { getAdvisorActivity, getAdvisorReport } from '../../../api/reports.js';
import type { AdvisorActivity, AdvisorReport, AdvisorRow } from '../types/index.js';

vi.mock('../../../api/reports.js', () => ({ getAdvisorReport: vi.fn(), getAdvisorActivity: vi.fn() }));

const mockGet = vi.mocked(getAdvisorReport);
const mockActividad = vi.mocked(getAdvisorActivity);

function fila(nombre: string, atendidas: number, ventas: number, activo = true, segundosActivos = 0): AdvisorRow {
  return {
    asesorId: `id-${nombre}`,
    nombre,
    activo,
    conversacionesAtendidas: atendidas,
    asignadasActivas: atendidas + 2,
    ventas,
    tasaCierre: atendidas ? ventas / atendidas : 0,
    segundosActivos,
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
      segundosActivos: filas.reduce((s, f) => s + f.segundosActivos, 0),
    },
    porAsesor: filas,
    sinAsignar,
  };
}

function actividad(asesores: AdvisorActivity['asesores'] = [], periodos: AdvisorActivity['periodos'] = []): AdvisorActivity {
  return {
    generadoAt: '2026-10-08T15:00:00.000Z',
    rango: { desde: '2026-09-09T00:00:00.000Z', hasta: '2026-10-08T23:59:59.999Z' },
    granularidad: 'dia',
    timezone: 'UTC',
    asesores,
    periodos,
  };
}

function renderPage(url = '/reports/advisors'): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <AdvisorReportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockActividad.mockResolvedValue(actividad());
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

describe('Refresco del tablero — HU-REP-05', () => {
  it('cada KPI lleva su icono y "Actualizar" vuelve a pedir sin pasar a esqueleto', async () => {
    mockGet.mockResolvedValue(reporte([fila('Laura', 120, 14)]));
    renderPage();

    expect(await screen.findByText(/^Actualizado a las \d/)).toBeInTheDocument();
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    expect(document.querySelectorAll('svg[data-kpi-icon]')).toHaveLength(5);

    // La recarga queda en vuelo para ver el estado intermedio.
    mockGet.mockImplementation(() => new Promise(() => undefined));
    const boton = screen.getByRole('button', { name: 'Actualizar' });
    await userEvent.click(boton);

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(mockGet.mock.calls[1]?.[0]).toEqual(mockGet.mock.calls[0]?.[0]);
    expect(boton).toBeDisabled();
    expect(boton.querySelector('svg')).toHaveClass('animate-spin');
    // CA-5: los datos siguen a la vista, sin esqueletos.
    expect(document.querySelectorAll('svg[data-kpi-icon]')).toHaveLength(5);
    expect(document.querySelector('[aria-busy="true"]:not(button)')).toBeNull();
  });
});

describe('Tiempo activo — HU-REP-06', () => {
  const ID_LAURA = 'aaaaaaaaaaaaaaaaaaaaaaaa';

  it('muestra el total y el promedio en la franja, y la columna en h:mm', async () => {
    mockGet.mockResolvedValue(reporte([fila('Laura', 120, 14, true, 45_000), fila('Pedro', 40, 2, true, 0)]));
    renderPage();

    await screen.findByText('Laura');
    expect(screen.getByText('Tiempo activo', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('12 h 30 min')).toBeInTheDocument();
    // Solo cuenta para el promedio quien registró tiempo.
    expect(screen.getByText('Promedio de 12 h 30 min por asesor')).toBeInTheDocument();
    const tabla = screen.getByRole('table');
    expect(within(tabla).getAllByText('12:30').length).toBeGreaterThan(0);
  });

  it('pide la serie del mismo periodo por día y con la zona del navegador', async () => {
    mockGet.mockResolvedValue(reporte([fila('Laura', 1, 0)]));
    renderPage();

    await waitFor(() => expect(mockActividad).toHaveBeenCalled());
    const params = mockActividad.mock.calls[0]?.[0];
    expect(params?.granularidad).toBe('dia');
    expect(params?.desde).toBe(mockGet.mock.calls[0]?.[0]?.desde);
    expect(params?.hasta).toBe(mockGet.mock.calls[0]?.[0]?.hasta);
    // El filtro por asesor se aplica en la gráfica: la serie llega siempre completa.
    expect(params).not.toHaveProperty('asesorId');
  });

  it('cambiar a «Semana» vuelve a pedir con esa granularidad', async () => {
    mockGet.mockResolvedValue(reporte([fila('Laura', 1, 0)]));
    renderPage();

    await userEvent.click(await screen.findByRole('tab', { name: 'Semana' }));
    await waitFor(() =>
      expect(mockActividad.mock.calls.some(([p]) => p.granularidad === 'semana')).toBe(true),
    );
  });

  it('la granularidad de la URL se respeta al cargar', async () => {
    mockGet.mockResolvedValue(reporte([fila('Laura', 1, 0)]));
    renderPage('/reports/advisors?granularidad=mes');

    await waitFor(() => expect(mockActividad.mock.calls[0]?.[0]?.granularidad).toBe('mes'));
    expect(await screen.findByRole('tab', { name: 'Mes' })).toHaveAttribute('data-state', 'active');
  });

  it('sin tiempo registrado explica por qué la gráfica está vacía', async () => {
    mockGet.mockResolvedValue(reporte([fila('Laura', 1, 0)]));
    renderPage();

    expect(await screen.findByText(/Todavía no hay tiempo activo en este periodo/)).toBeInTheDocument();
  });

  it('con un asesor elegido en la URL que no tiene tiempo lo dice', async () => {
    mockGet.mockResolvedValue(reporte([fila('Laura', 1, 0)]));
    mockActividad.mockResolvedValue(
      actividad(
        [{ asesorId: 'bbbbbbbbbbbbbbbbbbbbbbbb', nombre: 'Pedro', totalSegundos: 600 }],
        [{ periodo: '2026-10-08', totalSegundos: 600, porAsesor: [{ asesorId: 'bbbbbbbbbbbbbbbbbbbbbbbb', segundos: 600 }] }],
      ),
    );
    renderPage(`/reports/advisors?asesor=${ID_LAURA}`);

    expect(await screen.findByText('Este asesor no tiene tiempo activo en el periodo.')).toBeInTheDocument();
  });
});
