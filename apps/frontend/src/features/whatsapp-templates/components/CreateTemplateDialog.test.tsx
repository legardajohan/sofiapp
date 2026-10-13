import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateTemplateDialog } from './CreateTemplateDialog.js';
import { createWhatsAppTemplate, uploadTemplateImage } from '../../../api/whatsapp-templates.js';

vi.mock('../../../api/whatsapp-templates.js', () => ({
  createWhatsAppTemplate: vi.fn(),
  uploadTemplateImage: vi.fn(),
  templateErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

const mockCreate = vi.mocked(createWhatsAppTemplate);
const mockUpload = vi.mocked(uploadTemplateImage);

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:muestra');
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  mockCreate.mockReset();
  mockUpload.mockReset();
});

function montar(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CreateTemplateDialog open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

async function rellenarBasico(): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Nombre'), 'promo_mes');
  await user.type(screen.getByLabelText('Cuerpo'), 'Hola, mira la promo');
}

describe('CreateTemplateDialog (HT-WA-04)', () => {
  it('por defecto es de solo texto y manda el payload de HT-WA-02, sin cabecera', async () => {
    mockCreate.mockResolvedValue({ name: 'promo_mes' } as never);
    montar();
    await rellenarBasico();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar a Meta' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0]![0]).not.toHaveProperty('cabecera');
  });

  it('con imagen: sube la muestra al elegirla y envía su uploadId', async () => {
    mockUpload.mockImplementation(async (_f, onProgress) => {
      onProgress?.(100);
      return { uploadId: 'up-1', mimeType: 'image/png', tamanoBytes: 1 };
    });
    mockCreate.mockResolvedValue({ name: 'promo_mes' } as never);
    montar();
    await rellenarBasico();

    fireEvent.click(screen.getByRole('radio', { name: /Texto \+ imagen/ }));
    const png = new File(['x'], 'promo.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('imagen-input'), { target: { files: [png] } });

    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith(png, expect.any(Function)));
    const enviar = screen.getByRole('button', { name: 'Enviar a Meta' });
    await waitFor(() => expect(enviar).toBeEnabled());
    fireEvent.click(enviar);

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0]![0]).toMatchObject({
      cabecera: { formato: 'IMAGE', uploadId: 'up-1' },
    });
  });

  it('con imagen elegida pero sin subir no se puede enviar; un GIF no llega al API', async () => {
    montar();
    await rellenarBasico();

    fireEvent.click(screen.getByRole('radio', { name: /Texto \+ imagen/ }));
    fireEvent.change(screen.getByTestId('imagen-input'), {
      target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] },
    });

    expect(mockUpload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('JPG o PNG');
    expect(screen.getByRole('button', { name: 'Enviar a Meta' })).toBeDisabled();
  });

  it('en Autenticación la opción de imagen queda deshabilitada y se explica por qué', async () => {
    montar();
    fireEvent.click(screen.getByRole('radio', { name: /Texto \+ imagen/ }));
    expect(screen.getByRole('radio', { name: /Texto \+ imagen/ })).toBeChecked();

    // Elegir la categoría con el select de Radix desde el teclado es frágil en jsdom: se usa el
    // trigger y la opción visibles.
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Categoría' }));
    await user.click(await screen.findByRole('option', { name: 'Autenticación' }));

    expect(screen.getByRole('radio', { name: /Texto \+ imagen/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Solo texto/ })).toBeChecked();
    expect(
      screen.getByText('La imagen solo está disponible para plantillas de Marketing y Utilidad.'),
    ).toBeInTheDocument();
  });
});
