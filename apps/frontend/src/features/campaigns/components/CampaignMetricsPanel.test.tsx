import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CampaignMetricsPanel } from './CampaignMetricsPanel.js';
import { fetchCampaignMetrics } from '../api.js';
import type { CampaignMetricsDTO } from '../types.js';

vi.mock('../api.js', () => ({ fetchCampaignMetrics: vi.fn() }));

const mockMetrics = vi.mocked(fetchCampaignMetrics);

function metricas(parcial: Partial<CampaignMetricsDTO> = {}): CampaignMetricsDTO {
  return {
    campaignId: 'c1',
    destinatarios: 200,
    enviados: 200,
    entregados: 180,
    leidos: 90,
    respondidos: 36,
    convertidos: 9,
    fallidos: 0,
    tasas: { entrega: 0.9, apertura: 0.5, respuesta: 0.2, conversion: 0.05 },
    ventanas: { respuestaHoras: 72, conversionDias: 14 },
    serie: [],
    calculadoAt: '2026-10-20T15:00:00.000Z',
    ...parcial,
  };
}

function renderPanel(iniciadaAt: string | null = '2026-10-20T12:00:00.000Z'): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CampaignMetricsPanel campana={{ id: 'c1', estado: 'completada', iniciadaAt }} />
    </QueryClientProvider>,
  );
}

describe('HU-MARK-04 — CampaignMetricsPanel', () => {
  beforeEach(() => mockMetrics.mockReset());

  it('pinta los cinco pasos con su conteo y su tasa contra el denominador correcto', async () => {
    mockMetrics.mockResolvedValue(metricas());
    renderPanel();

    expect(await screen.findByText('Respondieron')).toBeInTheDocument();
    for (const etiqueta of ['Enviados', 'Entregados', 'Abiertos', 'Convirtieron']) {
      expect(screen.getByText(etiqueta)).toBeInTheDocument();
    }
    expect(screen.getByText('180')).toBeInTheDocument();
    expect(screen.getByText(/90\s?% de los enviados/)).toBeInTheDocument();
    expect(screen.getByText(/al menos 50\s?% de los entregados/)).toBeInTheDocument();
    expect(screen.getByText(/20\s?% de los entregados/)).toBeInTheDocument();
    expect(screen.getByText(/72 horas/)).toBeInTheDocument();
  });

  it('sin envíos todavía → estado vacío, sin embudo', async () => {
    mockMetrics.mockResolvedValue(
      metricas({
        enviados: 0,
        entregados: 0,
        leidos: 0,
        respondidos: 0,
        convertidos: 0,
        tasas: { entrega: null, apertura: null, respuesta: null, conversion: null },
      }),
    );
    renderPanel();

    expect(await screen.findByText(/Todavía no ha salido ningún mensaje/)).toBeInTheDocument();
    expect(screen.queryByText('Respondieron')).not.toBeInTheDocument();
  });

  it('una campaña anterior a la medición lo avisa', async () => {
    mockMetrics.mockResolvedValue(metricas({ leidos: 0, respondidos: 0, convertidos: 0 }));
    renderPanel('2026-09-01T12:00:00.000Z');

    expect(await screen.findByText(/salió antes de que SofiApp registrara/)).toBeInTheDocument();
  });
});
