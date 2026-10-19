import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AdminMetricsPage } from './AdminMetricsPage.js';
import { getGlobalMetrics } from '../../../api/admin-metrics.js';
import type { GlobalMetrics, TenantMetricsRow } from '../types/index.js';

vi.mock('../../../api/admin-metrics.js', () => ({ getGlobalMetrics: vi.fn() }));

const mockGet = vi.mocked(getGlobalMetrics);

function fila(nombre: string, leads: number, ventas: number): TenantMetricsRow {
  return {
    tenantId: `id-${nombre}`,
    nombre,
    slug: nombre.toLowerCase(),
    estado: 'activo',
    plan: { _id: 'p1', nombre: 'Pro' },
    usuarios: 3,
    conversaciones: 40,
    mensajes: 120,
    leads,
    ventas,
    tasaConversion: leads ? ventas / leads : 0,
    campanas: 2,
  };
}

function respuesta(items: TenantMetricsRow[]): GlobalMetrics {
  return {
    generadoAt: '2026-10-08T15:00:00.000Z',
    rango: null,
    consolidado: {
      empresas: { total: items.length, porEstado: { activo: items.length, suspendido: 0, prueba: 0 } },
      planes: [{ planId: 'p1', nombre: 'Pro', empresas: items.length }],
      usuarios: { total: 1234, activos: 1200 },
      conversaciones: { total: 80, activas: 50 },
      mensajes: { inbound: 100, outbound: 140 },
      leads: 30,
      ventas: 6,
      tasaConversion: 0.2,
      campanas: {
        total: 4,
        porEstado: { borrador: 0, programada: 0, en_curso: 0, pausada: 0, completada: 4, cancelada: 0, fallida: 0 },
      },
    },
    serieMensual: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((periodo) => ({
      periodo,
      conversaciones: 10,
      leads: 5,
      ventas: 1,
    })),
    porEmpresa: { items, page: 1, limit: 20, total: items.length },
  };
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/metrics']}>
        <AdminMetricsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminMetricsPage — HU-SAAS-03', () => {
  it('muestra los totales consolidados y una fila por empresa', async () => {
    mockGet.mockResolvedValue(respuesta([fila('Acme', 20, 5), fila('Beta', 10, 1)]));
    renderPage();

    expect(await screen.findByText('1.234')).toBeInTheDocument();
    expect(screen.getByText(/^20,0\s?%\sde los leads$/)).toBeInTheDocument();

    const tabla = screen.getByRole('table');
    expect(within(tabla).getByText('Acme')).toBeInTheDocument();
    expect(within(tabla).getByText('Beta')).toBeInTheDocument();
    expect(within(tabla).getByText(/^25,0\s?%$/)).toBeInTheDocument();
  });

  it('pide el desglose ordenado al pulsar una columna', async () => {
    mockGet.mockResolvedValue(respuesta([fila('Acme', 20, 5)]));
    renderPage();
    await screen.findByText('Acme', { selector: 'span' });

    await userEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /^Ventas/ }));

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(expect.objectContaining({ sort: 'ventas', order: 'desc', limit: 20 })),
    );
  });

  it('con error ofrece reintentar', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText('No pudimos cargar las métricas')).toBeInTheDocument();
    mockGet.mockResolvedValue(respuesta([]));
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText('Aún no hay empresas registradas. Créalas desde Empresas.')).toBeInTheDocument();
  });
});

describe('Refresco del tablero — HU-REP-05', () => {
  it('cada KPI lleva su icono y "Actualizar" vuelve a pedir sin pasar a esqueleto', async () => {
    mockGet.mockResolvedValue(respuesta([fila('Acme', 20, 5)]));
    renderPage();

    expect(await screen.findByText(/^Actualizado a las \d/)).toBeInTheDocument();
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(document.querySelectorAll('svg[data-kpi-icon]')).toHaveLength(6);

    // La recarga queda en vuelo para ver el estado intermedio.
    mockGet.mockImplementation(() => new Promise(() => undefined));
    const boton = screen.getByRole('button', { name: 'Actualizar' });
    await userEvent.click(boton);

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(4));
    // CA-8: se repiten las dos queries del tablero (la principal y la del top), en cualquier orden.
    const iniciales = mockGet.mock.calls.slice(0, 2).map(([p]) => p);
    const recargas = mockGet.mock.calls.slice(2).map(([p]) => p);
    expect(recargas).toEqual(expect.arrayContaining(iniciales));
    expect(boton).toBeDisabled();
    expect(boton.querySelector('svg')).toHaveClass('animate-spin');
    // CA-5: los datos siguen a la vista, sin esqueletos.
    expect(document.querySelectorAll('svg[data-kpi-icon]')).toHaveLength(6);
    expect(document.querySelector('[aria-busy="true"]:not(button)')).toBeNull();
  });
});
