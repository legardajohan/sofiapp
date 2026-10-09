import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CampaignScheduler } from './CampaignScheduler.js';
import { previewSegmento } from '../api.js';
import { getWhatsAppTemplates } from '@/api/whatsapp-templates';
import type { IWhatsAppTemplate } from '@/features/whatsapp-templates/types';
import type { SegmentPreviewDTO } from '../types.js';

vi.mock('../api.js', () => ({ previewSegmento: vi.fn() }));
vi.mock('@/api/whatsapp-templates', () => ({ getWhatsAppTemplates: vi.fn() }));
vi.mock('@/features/contacts/hooks/useContactOptions', () => ({
  useContactOptions: () => ({ data: { rol: [], interes: [], objecion: [] } }),
}));
vi.mock('@/features/tags/hooks/useTags', () => ({
  useTags: () => ({ data: [{ id: 't1', nombre: 'VIP', color: '#7C3AED', semaforo: null }] }),
}));
vi.mock('@/features/semaforos', () => ({ useSemaforos: () => ({ data: [] }) }));

const mockPreview = vi.mocked(previewSegmento);
const mockTemplates = vi.mocked(getWhatsAppTemplates);

const PREVIEW: SegmentPreviewDTO = {
  total: 42,
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
};

function plantilla(parcial: Partial<IWhatsAppTemplate>): IWhatsAppTemplate {
  return {
    id: 't1',
    name: 'seguimiento_img',
    language: 'es',
    category: 'MARKETING',
    status: 'APPROVED',
    cuerpo: 'Hola, {{1}}',
    ejemplos: ['Ana'],
    parametrosBody: 1,
    cabecera: 'IMAGE',
    obsoleta: false,
    syncedAt: new Date().toISOString(),
    ...parcial,
  };
}

function renderScheduler(onSubmit = vi.fn()): { onSubmit: ReturnType<typeof vi.fn> } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CampaignScheduler open pending={false} onOpenChange={vi.fn()} onSubmit={onSubmit} />
    </QueryClientProvider>,
  );
  return { onSubmit };
}

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:previa');
  URL.revokeObjectURL = vi.fn();
});

describe('CampaignScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Solo se falsea el reloj: los temporizadores reales siguen, que es lo que usa userEvent.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 10, 10, 0));
    mockPreview.mockResolvedValue(PREVIEW);
    mockTemplates.mockResolvedValue({
      data: [
        plantilla({ id: 't1', name: 'seguimiento_img', cabecera: 'IMAGE' }),
        plantilla({ id: 't2', name: 'aviso_texto', cabecera: 'NINGUNA' }),
        plantilla({ id: 't3', name: 'factura_pdf', cabecera: 'DOCUMENT' }),
      ],
      total: 3,
      page: 1,
      limit: 100,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function irAlContenido(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('¿Qué les llega?')).toBeInTheDocument();
  }

  it('ofrece las plantillas con imagen y las de solo texto, nunca las de documento', async () => {
    const user = userEvent.setup();
    renderScheduler();
    await irAlContenido(user);

    await user.click(await screen.findByRole('combobox'));
    expect(await screen.findByRole('option', { name: /seguimiento_img.*con imagen/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /aviso_texto/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /factura_pdf/ })).not.toBeInTheDocument();
  });

  it('con una plantilla de imagen no deja continuar hasta que se elige la imagen', async () => {
    const user = userEvent.setup();
    renderScheduler();
    await irAlContenido(user);

    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /seguimiento_img/ }));
    await user.type(screen.getByLabelText('Valor para el hueco 1'), 'te esperamos');

    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();

    fireEvent.change(screen.getByTestId('imagen-input'), {
      target: { files: [new File(['x'], 'promo.png', { type: 'image/png' })] },
    });

    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled();
    // La vista previa refleja el texto escrito.
    expect(screen.getByText('Hola, te esperamos')).toBeInTheDocument();
  });

  it('recorre los tres pasos y envía contenido, imagen, filtros y la hora elegida', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderScheduler();
    await irAlContenido(user);

    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /seguimiento_img/ }));
    await user.type(screen.getByLabelText('Valor para el hueco 1'), 'te esperamos');
    const png = new File(['x'], 'promo.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('imagen-input'), { target: { files: [png] } });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByText('¿Cuándo sale?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Programar campaña' })).toBeDisabled();

    await user.click(await screen.findByRole('button', { name: /15 de septiembre/i }));
    await user.type(screen.getByLabelText('Nombre de la campaña'), 'Seguimiento septiembre');

    expect(screen.getByText(/Sale el/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Programar campaña' }));

    expect(onSubmit).toHaveBeenCalledWith({
      nombre: 'Seguimiento septiembre',
      filtros: {},
      templateId: 't1',
      parametros: ['te esperamos'],
      programadaPara: new Date(2026, 8, 15, 9, 0).toISOString(),
      imagen: png,
    });
  });

  it('una plantilla de solo texto se programa sin imagen', async () => {
    const user = userEvent.setup();
    renderScheduler();
    await irAlContenido(user);

    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /aviso_texto/ }));
    await user.type(screen.getByLabelText('Valor para el hueco 1'), 'hola');

    expect(screen.queryByTestId('imagen-input')).not.toBeInTheDocument();
    expect(screen.getByText(/Esta plantilla no lleva imagen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled();
  });
});
