import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TopProductsPage } from './TopProductsPage.js';
import { getTopProducts } from '../../../api/reports.js';
import type { TopProducts } from '../types/index.js';

vi.mock('../../../api/reports.js', () => ({ getTopProducts: vi.fn() }));

const mockGet = vi.mocked(getTopProducts);

function reporte(over: Partial<TopProducts> = {}): TopProducts {
  return {
    generadoAt: '2026-10-08T15:00:00.000Z',
    rango: { desde: '2026-09-09T00:00:00.000Z', hasta: '2026-10-08T23:59:59.999Z' },
    catalogoDisponible: true,
    totalConsultas: 412,
    clasificadas: 380,
    sinClasificar: 32,
    ranking: [
      { clave: 'curso intensivo', nombre: 'Curso intensivo', enCatalogo: true, conversaciones: 140, share: 0.3684 },
      { clave: 'curso de verano', nombre: 'Curso de verano', enCatalogo: false, conversaciones: 90, share: 0.2368 },
    ],
    otros: { conversaciones: 41, share: 0.1079 },
    restantes: { productos: 3, conversaciones: 12, share: 0.0316 },
    ...over,
  };
}

function renderPage(entry = '/reports/top-products'): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <TopProductsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TopProductsPage — HU-REP-03', () => {
  it('pide los últimos 30 días con top 10 por defecto y pinta los KPIs', async () => {
    mockGet.mockResolvedValue(reporte());
    renderPage();

    expect(await screen.findByText('Producto más consultado')).toBeInTheDocument();
    expect(screen.getAllByText('Curso intensivo').length).toBeGreaterThan(0);
    expect(screen.getByText('412')).toBeInTheDocument();
    expect(screen.getByText('380')).toBeInTheDocument();
    expect(screen.getByText('32')).toBeInTheDocument();
    expect(screen.getByText(/^92[,.]2\s?% de las consultas$/)).toBeInTheDocument(); // 380 / 412
    expect(screen.getByText(/^Del 9 (de )?\S+ al 8 (de )?\S+ (de )?2026$/)).toBeInTheDocument();

    const params = mockGet.mock.calls[0]?.[0];
    expect(params?.top).toBe(10);
    expect(params?.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params?.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('marca el producto que ya no está en la base de conocimiento', async () => {
    mockGet.mockResolvedValue(reporte());
    renderPage();

    expect(await screen.findByText('Ya no está en tu base de conocimiento')).toBeInTheDocument();
    expect(screen.getByText('Curso de verano')).toBeInTheDocument();
  });

  it('el top y el rango de la URL viajan al endpoint', async () => {
    mockGet.mockResolvedValue(reporte());
    renderPage('/reports/top-products?periodo=personalizado&desde=2026-09-01&hasta=2026-09-15&top=5');

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls.at(-1)?.[0]).toEqual({ desde: '2026-09-01', hasta: '2026-09-15', top: 5 });
  });

  it('cambiar el tamaño del ranking vuelve a pedir con el nuevo top', async () => {
    mockGet.mockResolvedValue(reporte());
    renderPage();
    await screen.findByText('Producto más consultado');

    await userEvent.click(screen.getByRole('tab', { name: 'Top 20' }));

    await waitFor(() => expect(mockGet.mock.calls.at(-1)?.[0]?.top).toBe(20));
  });

  it('un top fuera de las opciones cae al valor por defecto', async () => {
    mockGet.mockResolvedValue(reporte());
    renderPage('/reports/top-products?top=999');

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls.at(-1)?.[0]?.top).toBe(10);
  });

  it('sin consultas muestra el vacío del periodo', async () => {
    mockGet.mockResolvedValue(
      reporte({
        totalConsultas: 0,
        clasificadas: 0,
        sinClasificar: 0,
        ranking: [],
        otros: { conversaciones: 0, share: 0 },
        restantes: { productos: 0, conversaciones: 0, share: 0 },
      }),
    );
    renderPage();

    expect(await screen.findByText('Ningún cliente escribió en este periodo.')).toBeInTheDocument();
  });

  it('sin productos en la base de conocimiento enlaza a cargarlos', async () => {
    mockGet.mockResolvedValue(
      reporte({
        catalogoDisponible: false,
        clasificadas: 0,
        sinClasificar: 412,
        ranking: [],
        otros: { conversaciones: 0, share: 0 },
        restantes: { productos: 0, conversaciones: 0, share: 0 },
      }),
    );
    renderPage();

    const enlace = await screen.findByRole('link', { name: /Ir a la base de conocimiento/ });
    expect(enlace).toHaveAttribute('href', '/settings/knowledge');
  });

  it('con error ofrece reintentar', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText('No pudimos cargar el reporte')).toBeInTheDocument();
    mockGet.mockResolvedValue(reporte());
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText('Producto más consultado')).toBeInTheDocument();
  });
});
