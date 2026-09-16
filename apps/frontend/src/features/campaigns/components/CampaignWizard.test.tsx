import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CampaignWizard } from './CampaignWizard.js';
import { previewSegmento } from '../api.js';
import { getWhatsAppTemplates } from '@/api/whatsapp-templates';
import type { SegmentPreviewDTO } from '../types.js';

vi.mock('../api.js', () => ({ previewSegmento: vi.fn() }));
vi.mock('@/api/whatsapp-templates', () => ({ getWhatsAppTemplates: vi.fn() }));
// Los catálogos del tenant son de otros features: se simulan para aislar el wizard.
vi.mock('@/features/contacts/hooks/useContactOptions', () => ({
  useContactOptions: () => ({
    data: {
      rol: [{ id: 'r1', tipo: 'rol', key: 'estudiante', label: 'Estudiante', color: '#2563EB', orden: 0, activo: true, esDefecto: true }],
      interes: [],
      objecion: [],
    },
  }),
}));
vi.mock('@/features/semaforos', () => ({
  useSemaforos: () => ({
    data: [{ id: 's1', key: 'verde', label: 'Venta concretada', color: '#16A34A', orden: 0, activo: true, esDefecto: true }],
  }),
}));

const mockPreview = vi.mocked(previewSegmento);
const mockTemplates = vi.mocked(getWhatsAppTemplates);

function preview(parcial: Partial<SegmentPreviewDTO> = {}): SegmentPreviewDTO {
  return {
    total: 120,
    muestra: [{ id: 'c1', nombre: 'Ana', telefono: '573001110001' }],
    presupuesto: {
      tier: 'TIER_1K',
      calidad: 'GREEN',
      limiteDiario: 800,
      consumido24h: 0,
      disponible: 800,
      intervaloMs: 108_000,
      bloqueado: false,
      motivoBloqueo: null,
    },
    ...parcial,
  };
}

function renderWizard(onSubmit = vi.fn()): { onSubmit: ReturnType<typeof vi.fn> } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CampaignWizard open pending={false} onOpenChange={vi.fn()} onSubmit={onSubmit} />
    </QueryClientProvider>,
  );
  return { onSubmit };
}

describe('CampaignWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreview.mockResolvedValue(preview());
    mockTemplates.mockResolvedValue({
      data: [
        {
          id: 't1',
          name: 'promo_matriculas',
          language: 'es',
          category: 'MARKETING',
          status: 'APPROVED',
          cuerpo: 'Hola, abrimos matrículas.',
          ejemplos: [],
          parametrosBody: 0,
          obsoleta: false,
          syncedAt: new Date().toISOString(),
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    });
  });

  it('arranca en el segmento y muestra cuánta gente entra', async () => {
    renderWizard();

    expect(screen.getByText('¿A quién le escribes?')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('120')).toBeInTheDocument());
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });

  it('no deja continuar mientras el segmento esté vacío', async () => {
    mockPreview.mockResolvedValue(preview({ total: 0, muestra: [] }));
    renderWizard();

    await waitFor(() =>
      expect(screen.getByText(/Ningún contacto cumple estos filtros/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  });

  it('recorre los tres pasos y envía el segmento, la plantilla y el nombre', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderWizard();

    await waitFor(() => expect(screen.getByText('120')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByText('¿Qué les dices?')).toBeInTheDocument();
    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /promo_matriculas/ }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByText('Revisa antes de enviar')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nombre de la campaña'), 'Matrículas 2026');

    await user.click(screen.getByRole('button', { name: /Enviar a 120/ }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Matrículas 2026', templateId: 't1', lanzar: true }),
    );
  });

  it('bloquea el envío cuando la calidad del número está en rojo', async () => {
    const user = userEvent.setup();
    mockPreview.mockResolvedValue(
      preview({
        presupuesto: {
          tier: 'TIER_1K',
          calidad: 'RED',
          limiteDiario: 0,
          consumido24h: 0,
          disponible: 0,
          intervaloMs: 1000,
          bloqueado: true,
          motivoBloqueo: 'La calidad del número de WhatsApp está en rojo.',
        },
      }),
    );
    renderWizard();

    await waitFor(() => expect(screen.getByText('120')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /promo_matriculas/ }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    await user.type(screen.getByLabelText('Nombre de la campaña'), 'Matrículas 2026');

    expect(screen.getByText(/está en rojo/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar a 120/ })).toBeDisabled();
    // Guardar el borrador SÍ se permite: el trabajo del wizard no se pierde por un número enfermo.
    expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeEnabled();
  });

  it('el filtro por «grado» viaja como atributo personalizado, no como campo propio', async () => {
    const user = userEvent.setup();
    renderWizard();

    await waitFor(() => expect(screen.getByText('120')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Añadir un dato/ }));
    await user.type(screen.getByLabelText('Nombre del dato'), 'grado');
    await user.type(screen.getByLabelText(/Valores aceptados/), '10, 11');

    // Margen holgado: el wizard espera 400 ms sin teclear antes de consultar, así que la llamada
    // con el valor definitivo no llega dentro del segundo por defecto de `waitFor`.
    await waitFor(
      () =>
        expect(mockPreview).toHaveBeenCalledWith(
          expect.objectContaining({ atributos: [{ key: 'grado', valores: ['10', '11'] }] }),
        ),
      { timeout: 3000 },
    );
  });
});
