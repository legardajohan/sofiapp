import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiContextPage } from './AiContextPage.js';
import { fetchAiResponses } from '../api.js';
import type { AiResponseSummary, Paginated } from '../types.js';

vi.mock('../api.js', () => ({ fetchAiResponses: vi.fn(), fetchAiResponseContext: vi.fn() }));

const mockFetch = vi.mocked(fetchAiResponses);

function fila(i: number): AiResponseSummary {
  return {
    id: `r${i}`,
    method: 'chat',
    model: 'gemini-1.5-flash',
    cacheHit: false,
    fromFaq: false,
    durationMs: 100,
    tokens: { prompt: 1, completion: 1, total: 2 },
    createdAt: '2026-10-02T15:00:00.000Z',
  };
}

function pagina(total: number): Paginated<AiResponseSummary> {
  return { data: Array.from({ length: Math.min(total, 20) }, (_, i) => fila(i)), page: 1, limit: 20, total };
}

const local = (y: number, m: number, d: number): string => new Date(y, m - 1, d).toISOString();
const ultimaLlamada = () => mockFetch.mock.calls.at(-1)?.[0];

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AiContextPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(pagina(45));
});

describe('AiContextPage — filtro por fechas (HU-REP-05-V2)', () => {
  it('elegir fechas vuelve a la página 1 y envía instantes de la zona del navegador', async () => {
    renderPage();
    await screen.findByText('Página 1 de 3');
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(ultimaLlamada()?.page).toBe(2));

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-03' } });

    await waitFor(() =>
      expect(ultimaLlamada()).toEqual({ page: 1, method: undefined, desde: local(2026, 10, 1), hasta: local(2026, 10, 4) }),
    );
  });

  it('con el rango invertido avisa y no lo envía', async () => {
    renderPage();
    await screen.findByText('Página 1 de 3');

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-05' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(ultimaLlamada()).toEqual({ page: 1, method: undefined });
  });

  it('limpiar quita el rango y vuelve a pedir sin él', async () => {
    renderPage();
    await screen.findByText('Página 1 de 3');
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(ultimaLlamada()?.desde).toBe(local(2026, 10, 1)));

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar fechas' }));
    await waitFor(() => expect(ultimaLlamada()).toEqual({ page: 1, method: undefined }));
    expect(screen.getByLabelText('Desde')).toHaveValue('');
  });

  it('sin resultados en el rango lo dice, en vez de "todavía no hay respuestas"', async () => {
    renderPage();
    await screen.findByText('Página 1 de 3');
    mockFetch.mockResolvedValue(pagina(0));

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-01-01' } });

    expect(await screen.findByText('Ninguna respuesta en esas fechas')).toBeInTheDocument();
    expect(screen.queryByText('Todavía no hay respuestas registradas')).not.toBeInTheDocument();
  });
});
