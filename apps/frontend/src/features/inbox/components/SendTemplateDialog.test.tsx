import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SendTemplateDialog } from './SendTemplateDialog.js';
import { sendTemplateMessage } from '../api.js';
import { getWhatsAppTemplates } from '@/api/whatsapp-templates';
import type { IWhatsAppTemplate } from '@/features/whatsapp-templates/types';

vi.mock('../api.js', () => ({ sendTemplateMessage: vi.fn() }));
vi.mock('@/api/whatsapp-templates', () => ({
  getWhatsAppTemplates: vi.fn(),
  templateErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

const mockSend = vi.mocked(sendTemplateMessage);
const mockTemplates = vi.mocked(getWhatsAppTemplates);

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:reemplazo');
  URL.revokeObjectURL = vi.fn();
});

function plantilla(parcial: Partial<IWhatsAppTemplate>): IWhatsAppTemplate {
  return {
    id: 't1',
    name: 'promo_img',
    language: 'es',
    category: 'MARKETING',
    status: 'APPROVED',
    cuerpo: 'Hola {{1}}, mira la promo',
    ejemplos: ['Ana'],
    parametrosBody: 1,
    cabecera: 'IMAGE',
    pie: null,
    imagen: { url: '/media/templates/t1/imagen?t=abc', mimeType: 'image/png', tamanoBytes: 10 },
    motivoRechazo: null,
    obsoleta: false,
    syncedAt: '2026-10-01T00:00:00.000Z',
    ...parcial,
  };
}

beforeEach(() => {
  mockSend.mockReset().mockResolvedValue({ id: 'm1', status: 'sent' });
  mockTemplates.mockReset().mockResolvedValue({
    data: [
      plantilla({}),
      plantilla({ id: 't2', name: 'factura_pdf', cabecera: 'DOCUMENT', imagen: null }),
    ],
    total: 2,
    page: 1,
    limit: 100,
  });
});

function montar(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SendTemplateDialog open onOpenChange={vi.fn()} clienteId="c1" nombre="Ana" />
    </QueryClientProvider>,
  );
}

async function elegirPlantilla(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('combobox', { name: 'Plantilla' }));
  expect(screen.queryByRole('option', { name: /factura_pdf/ })).not.toBeInTheDocument();
  await user.click(await screen.findByRole('option', { name: /promo_img/ }));
  await user.type(screen.getByLabelText('Valor para el hueco 1'), 'Luis');
  return user;
}

describe('SendTemplateDialog (HT-WA-04)', () => {
  it('sin cambiar la imagen envía con la de por defecto (no manda archivo)', async () => {
    montar();
    await elegirPlantilla();

    expect(screen.getByText('Hola Luis, mira la promo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar plantilla' }));

    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith({ clienteId: 'c1', templateId: 't1', parametros: ['Luis'] }),
    );
  });

  it('con imagen de reemplazo la manda y la vista previa muestra esa imagen', async () => {
    montar();
    await elegirPlantilla();
    const png = new File(['x'], 'otra.png', { type: 'image/png' });

    fireEvent.change(screen.getByTestId('imagen-mensaje-input'), { target: { files: [png] } });
    const imagenes = screen.getAllByRole('img');
    expect(imagenes.some((img) => img.getAttribute('src') === 'blob:reemplazo')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar plantilla' }));
    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith({
        clienteId: 'c1',
        templateId: 't1',
        parametros: ['Luis'],
        imagen: png,
      }),
    );
  });
});
