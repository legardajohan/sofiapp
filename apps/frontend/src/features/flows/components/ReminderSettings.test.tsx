import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReminderSettings } from './ReminderSettings.js';
import { useReminderSettings } from '../hooks/useReminderSettings.js';
import { getWhatsAppTemplates } from '../../../api/whatsapp-templates.js';
import type { ReminderDTO } from '../types.js';
import type { IWhatsAppTemplate, WhatsAppTemplatesListResponse } from '../../whatsapp-templates/types/index.js';

vi.mock('../hooks/useReminderSettings.js', () => ({ useReminderSettings: vi.fn() }));
vi.mock('../../../api/whatsapp-templates.js', () => ({ getWhatsAppTemplates: vi.fn() }));

const mockUseReminderSettings = vi.mocked(useReminderSettings);
const mockGetTemplates = vi.mocked(getWhatsAppTemplates);

function reminderDTO(overrides: Partial<ReminderDTO> = {}): ReminderDTO {
  return { activo: false, antelacionMinutos: 120, texto: '', templateId: null, ...overrides };
}

function plantilla(overrides: Partial<IWhatsAppTemplate> = {}): IWhatsAppTemplate {
  return {
    id: 'tpl-aprobada',
    name: 'recordatorio-aprobado',
    language: 'es',
    category: 'UTILITY',
    status: 'APPROVED',
    cuerpo: 'Hola {{1}}',
    ejemplos: ['Ana'],
    parametrosBody: 1,
    obsoleta: false,
    syncedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const listado = (data: IWhatsAppTemplate[]): WhatsAppTemplatesListResponse => ({
  data,
  total: data.length,
  page: 1,
  limit: 100,
});

function renderSettings(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ReminderSettings />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockUseReminderSettings.mockReset();
  mockGetTemplates.mockReset();
  mockGetTemplates.mockResolvedValue(listado([plantilla()]));
});

describe('ReminderSettings', () => {
  it('desactivado es el estado inicial: badge "Desactivado" y el switch apagado', async () => {
    mockUseReminderSettings.mockReturnValue({
      data: reminderDTO(),
      isLoading: false,
      save: vi.fn(),
      isSaving: false,
    } as unknown as ReturnType<typeof useReminderSettings>);

    renderSettings();

    expect(await screen.findByText('Desactivado')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /activar recordatorio/i })).not.toBeChecked();
  });

  it('el selector de plantilla solo ofrece las que llegan del catálogo (APPROVED, pedido al backend)', async () => {
    mockUseReminderSettings.mockReturnValue({
      data: reminderDTO(),
      isLoading: false,
      save: vi.fn(),
      isSaving: false,
    } as unknown as ReturnType<typeof useReminderSettings>);

    renderSettings();

    await waitFor(() => expect(mockGetTemplates).toHaveBeenCalledWith({ status: 'APPROVED', limit: 100 }));

    const user = userEvent.setup();
    const [, selectorPlantilla] = screen.getAllByRole('combobox');
    await user.click(selectorPlantilla!);
    expect(await screen.findByText('recordatorio-aprobado')).toBeInTheDocument();
  });

  it('el botón Guardar empieza deshabilitado y se activa al editar un campo', async () => {
    mockUseReminderSettings.mockReturnValue({
      data: reminderDTO(),
      isLoading: false,
      save: vi.fn(),
      isSaving: false,
    } as unknown as ReturnType<typeof useReminderSettings>);

    renderSettings();
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/Sigues por ahí/), 'Hola');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });

  it('activar sin texto bloquea el guardado con un aviso, sin llamar a save', async () => {
    const saveMock = vi.fn();
    mockUseReminderSettings.mockReturnValue({
      data: reminderDTO({ activo: false, texto: '' }),
      isLoading: false,
      save: saveMock,
      isSaving: false,
    } as unknown as ReturnType<typeof useReminderSettings>);

    renderSettings();
    const user = userEvent.setup();

    await user.click(screen.getByRole('switch', { name: /activar recordatorio/i }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(saveMock).not.toHaveBeenCalled();
  });

  it('guarda con el payload correcto cuando hay texto', async () => {
    const saveMock = vi.fn();
    mockUseReminderSettings.mockReturnValue({
      data: reminderDTO(),
      isLoading: false,
      save: saveMock,
      isSaving: false,
    } as unknown as ReturnType<typeof useReminderSettings>);

    renderSettings();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText(/Sigues por ahí/), 'Hola, ¿sigues ahí?');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({ activo: false, antelacionMinutos: 120, texto: 'Hola, ¿sigues ahí?' }),
      expect.anything(),
    );
  });
});
