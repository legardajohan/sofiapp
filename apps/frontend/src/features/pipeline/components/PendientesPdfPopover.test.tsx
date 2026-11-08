import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { toast } from 'sonner';
import { PendientesPdfPopover } from './PendientesPdfPopover.js';
import { downloadPendientesPdf } from '../api.js';
import { nombreArchivoPendientes, problemaConRango } from '../lib/rango-pdf.js';

vi.mock('../api.js', () => ({ downloadPendientesPdf: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockDownload = vi.mocked(downloadPendientesPdf);

function pintar(): void {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PendientesPdfPopover />
    </QueryClientProvider>,
  );
}

/** Abre el popover y elige dos días del mes visible por su número. */
async function elegirRango(user: ReturnType<typeof userEvent.setup>, inicio: string, fin: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: /Descargar PDF/ }));
  const dias = await screen.findAllByRole('button', { name: new RegExp(`\\b${inicio}\\b`) });
  await user.click(dias[0]!);
  const diasFin = screen.getAllByRole('button', { name: new RegExp(`\\b${fin}\\b`) });
  await user.click(diasFin[0]!);
}

function botonDescarga(): HTMLElement {
  const botones = screen.getAllByRole('button', { name: /Descargar PDF/ });
  // El último es el del pie del popover; el primero, el disparador de la cabecera.
  return botones[botones.length - 1]!;
}

describe('rango-pdf', () => {
  it('CA6: explica qué falta o qué está mal', () => {
    expect(problemaConRango(undefined, undefined)).toMatch(/Elige/);
    expect(problemaConRango(new Date(2026, 9, 1), undefined)).toBe('Falta la fecha final.');
    expect(problemaConRango(new Date(2026, 9, 2), new Date(2026, 9, 1))).toBe(
      'La fecha final no puede ser anterior a la inicial.',
    );
    expect(problemaConRango(new Date(2026, 9, 1), new Date(2026, 9, 1))).toBeNull();
  });

  it('nombra el archivo como pide la historia', () => {
    expect(nombreArchivoPendientes('2026-10-01', '2026-10-31')).toBe(
      'Pendientes_2026-10-01_a_2026-10-31.pdf',
    );
  });
});

describe('PendientesPdfPopover (HU-PDF-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    // jsdom no implementa la navegación que dispara el `<a download>`.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('CA6: sin rango el botón de descarga está deshabilitado', async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(screen.getByRole('button', { name: /Descargar PDF/ }));
    await screen.findByText('Reporte de pendientes');
    expect(botonDescarga()).toBeDisabled();
  });

  it('un solo clic elige un rango de un día, que es válido', async () => {
    // react-day-picker v9 fija `from` y `to` al mismo día con el primer clic: «solo el día 10» es
    // un rango legítimo, no una fecha final que falte.
    const user = userEvent.setup();
    pintar();
    await user.click(screen.getByRole('button', { name: /Descargar PDF/ }));
    const dias = await screen.findAllByRole('button', { name: /\b10\b/ });
    await user.click(dias[0]!);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(botonDescarga()).toBeEnabled();
  });

  it('CA4: con un rango válido descarga con días civiles y la zona del navegador', async () => {
    const user = userEvent.setup();
    mockDownload.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    pintar();
    await elegirRango(user, '10', '20');

    const boton = botonDescarga();
    expect(boton).toBeEnabled();
    await user.click(boton);

    await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
    const rango = mockDownload.mock.calls[0]![0];
    expect(rango.desde).toMatch(/^\d{4}-\d{2}-10$/);
    expect(rango.hasta).toMatch(/^\d{4}-\d{2}-20$/);
    expect(rango.tz).toBeTruthy();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('CA5: un rango sin pendientes muestra el mensaje y no descarga', async () => {
    const user = userEvent.setup();
    mockDownload.mockRejectedValue(
      new AxiosError('Not Found', '404', undefined, null, {
        status: 404,
        data: { message: 'No hay pendientes en el rango seleccionado.' },
        statusText: 'Not Found',
        headers: new AxiosHeaders(),
        config: { headers: new AxiosHeaders() },
      }),
    );
    pintar();
    await elegirRango(user, '10', '20');
    await user.click(botonDescarga());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('No hay pendientes en el rango seleccionado.'),
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
