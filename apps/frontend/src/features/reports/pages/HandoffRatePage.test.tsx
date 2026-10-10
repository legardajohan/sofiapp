import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { HandoffRatePage } from './HandoffRatePage.js';
import { getHandoffRate } from '../../../api/reports.js';
import type { HandoffRate } from '../types/index.js';

vi.mock('../../../api/reports.js', () => ({ getHandoffRate: vi.fn() }));

const mockGet = vi.mocked(getHandoffRate);

function tasa(conversacionesIa: number, porMotivo: Partial<Record<string, number>> = {}, handoffsExtra = 0): HandoffRate {
  const motivos = ['explicit_request', 'keyword', 'custom', 'low_confidence', 'intent_purchase'] as const;
  const transferidasPorMotivo = motivos.map((motivo) => ({ motivo, conversaciones: porMotivo[motivo] ?? 0 }));
  const transferidas = transferidasPorMotivo.reduce((s, f) => s + f.conversaciones, 0);
  return {
    generadoAt: '2026-10-08T15:00:00.000Z',
    rango: { desde: '2026-09-09T00:00:00.000Z', hasta: '2026-10-08T23:59:59.999Z' },
    conversacionesIa,
    transferidas,
    resueltasPorIa: conversacionesIa - transferidas,
    handoffsRegistrados: transferidas + handoffsExtra,
    tasaEscalamiento: conversacionesIa ? transferidas / conversacionesIa : 0,
    transferidasPorMotivo,
  };
}

function renderPage(entry = '/reports/handoff-rate'): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <HandoffRatePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HandoffRatePage — HU-REP-02', () => {
  it('pide los últimos 30 días por defecto y muestra la tasa y los conteos', async () => {
    mockGet.mockResolvedValue(tasa(200, { explicit_request: 30, keyword: 10 }, 3));
    renderPage();

    expect(await screen.findByText('Tasa de escalamiento', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getAllByText(/^20[,.]0\s?%$/).length).toBeGreaterThan(0); // 40 / 200
    expect(screen.getAllByText('200').length).toBeGreaterThan(0);
    expect(screen.getAllByText('160').length).toBeGreaterThan(0); // resueltas por Sofi
    expect(screen.getByText(/43 transferencias/)).toBeInTheDocument(); // 40 + 3 re-escaladas
    expect(screen.getByText(/^Del 9 (de )?\S+ al 8 (de )?\S+ (de )?2026$/)).toBeInTheDocument();

    const params = mockGet.mock.calls[0]?.[0];
    expect(params?.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params?.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('el rango de la URL viaja al endpoint', async () => {
    mockGet.mockResolvedValue(tasa(10, { custom: 1 }));
    renderPage('/reports/handoff-rate?periodo=personalizado&desde=2026-09-01&hasta=2026-09-15');

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls.at(-1)?.[0]).toEqual({ desde: '2026-09-01', hasta: '2026-09-15' });
  });

  it('sin conversaciones con Sofi muestra el vacío', async () => {
    mockGet.mockResolvedValue(tasa(0));
    renderPage();

    expect(await screen.findByText('Sofi no atendió conversaciones en este periodo.')).toBeInTheDocument();
    expect(screen.getByText('Sofi no transfirió conversaciones en este periodo.')).toBeInTheDocument();
  });

  it('con error ofrece reintentar', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText('No pudimos cargar el reporte')).toBeInTheDocument();
    mockGet.mockResolvedValue(tasa(0));
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText('Sofi no atendió conversaciones en este periodo.')).toBeInTheDocument();
  });
});
