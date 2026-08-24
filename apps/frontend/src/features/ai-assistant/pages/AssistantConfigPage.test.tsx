/**
 * Cubre los criterios de HU-IA-01 que se ven en pantalla: heredar la configuración de fábrica,
 * guardar la propia, y que la vista previa muestre el system prompt tal como lo recibe el modelo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssistantConfigPage } from './AssistantConfigPage.js';
import type { AssistantConfig } from '../types.js';

const { mockFetch, mockSave } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockSave: vi.fn(),
}));

vi.mock('../api.js', () => ({
  fetchAssistantConfig: mockFetch,
  saveAssistantConfig: mockSave,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const HEREDADA: AssistantConfig = {
  tono: 'profesional, claro y cercano',
  systemPrompt: 'Responde solo con el contexto.',
  heredado: true,
  version: '1.0.0',
};

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AssistantConfigPage />
    </QueryClientProvider>,
  );
}

describe('AssistantConfigPage (HU-IA-01)', () => {
  beforeEach(() => {
    mockFetch.mockReset().mockResolvedValue(HEREDADA);
    mockSave.mockReset();
  });

  it('avisa cuando la empresa todavía usa la configuración de fábrica', async () => {
    renderPage();

    expect(await screen.findByText(/configuración por defecto/i)).toBeInTheDocument();
  });

  it('precarga el tono y las instrucciones vigentes', async () => {
    renderPage();

    expect(await screen.findByLabelText('Tono')).toHaveValue('profesional, claro y cercano');
    expect(screen.getByLabelText('Instrucciones')).toHaveValue('Responde solo con el contexto.');
  });

  it('no deja guardar mientras no haya cambios', async () => {
    renderPage();

    const guardar = await screen.findByRole('button', { name: /guardar cambios/i });
    expect(guardar).toBeDisabled();
  });

  it('habilita el guardado al editar y envía lo escrito', async () => {
    mockSave.mockResolvedValue({ ...HEREDADA, tono: 'cercano y directo', heredado: false });
    renderPage();

    const tono = await screen.findByLabelText('Tono');
    await userEvent.clear(tono);
    await userEvent.type(tono, 'cercano y directo');

    const guardar = screen.getByRole('button', { name: /guardar cambios/i });
    expect(guardar).toBeEnabled();
    await userEvent.click(guardar);

    // TanStack Query añade su propio contexto como 2º argumento del `mutationFn`: se comprueba
    // solo el payload.
    await waitFor(() => {
      expect(mockSave.mock.calls[0]?.[0]).toEqual({
        tono: 'cercano y directo',
        systemPrompt: 'Responde solo con el contexto.',
      });
    });
  });

  it('no deja guardar con las instrucciones vacías', async () => {
    renderPage();

    await userEvent.clear(await screen.findByLabelText('Instrucciones'));

    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeDisabled();
  });

  it('descartar devuelve los campos a lo guardado', async () => {
    renderPage();

    const tono = await screen.findByLabelText('Tono');
    await userEvent.clear(tono);
    await userEvent.type(tono, 'otra cosa');

    await userEvent.click(screen.getByRole('button', { name: /descartar cambios/i }));

    expect(tono).toHaveValue('profesional, claro y cercano');
  });

  it('la vista previa refleja en vivo lo que se escribe, con el bloque de contexto', async () => {
    renderPage();

    const tono = await screen.findByLabelText('Tono');
    await userEvent.clear(tono);
    await userEvent.type(tono, 'informal');

    const preview = screen.getByText(/--- CONTEXTO ---/);
    expect(preview).toBeInTheDocument();
    expect(screen.getByText('informal')).toBeInTheDocument();
  });

  it('si la carga falla ofrece reintentar en vez de quedarse en blanco', async () => {
    mockFetch.mockRejectedValue(new Error('500'));
    renderPage();

    expect(await screen.findByText(/no se pudo cargar/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
  });
});
