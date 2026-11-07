/**
 * HU-CONF-01 — página «Horarios de envío»: validación en línea, franjas que cruzan la medianoche,
 * «copiar a todos los días» e importación de festivos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SendWindowPage } from './SendWindowPage.js';
import { CATEGORIAS_ENVIO, type PoliticaVentana, type SendWindowConfig } from '../types.js';

const { mockFetch, mockSave, mockStatus, mockFestivos } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockSave: vi.fn(),
  mockStatus: vi.fn(),
  mockFestivos: vi.fn(),
}));

vi.mock('../api.js', () => ({
  fetchSendWindowConfig: mockFetch,
  saveSendWindowConfig: mockSave,
  fetchSendWindowStatus: mockStatus,
  previewFestivos: mockFestivos,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const LABORAL = { dias: [1, 2, 3, 4, 5, 6], desde: '08:00', hasta: '19:00' };

const CONFIG: SendWindowConfig = {
  activo: true,
  zonaHoraria: 'America/Bogota',
  reglas: CATEGORIAS_ENVIO.map((categoria) => ({
    categoria,
    modo: categoria === 'asesor' || categoria === 'ia' ? 'libre' : 'restringido',
    franjas: [{ ...LABORAL, dias: [...LABORAL.dias] }],
  })),
  excepciones: [{ fecha: '2026-12-25', tipo: 'cerrado', motivo: 'Navidad', origen: 'festivo' }],
  configurado: true,
  version: 3,
  updatedAt: '2026-11-01T12:00:00.000Z',
};

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SendWindowPage />
    </QueryClientProvider>,
  );
}

async function abrirCampanas(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: /Campañas/ }));
}

function reglaGuardada(categoria: string): PoliticaVentana['reglas'][number] | undefined {
  const enviada = mockSave.mock.calls[0]?.[0] as PoliticaVentana | undefined;
  return enviada?.reglas.find((r) => r.categoria === categoria);
}

describe('SendWindowPage (HU-CONF-01)', () => {
  beforeEach(() => {
    mockFetch.mockReset().mockResolvedValue(structuredClone(CONFIG));
    mockSave.mockReset().mockImplementation(async (p: PoliticaVentana) => ({ ...CONFIG, ...p }));
    mockStatus.mockReset().mockResolvedValue({
      activo: true,
      zonaHoraria: 'America/Bogota',
      ahora: '2026-11-03T15:00:00.000Z',
      categorias: Object.fromEntries(
        CATEGORIAS_ENVIO.map((c) => [c, { permitido: true, siguienteApertura: null, siguienteCierre: null }]),
      ),
    });
    mockFestivos.mockReset().mockResolvedValue([
      { fecha: '2026-12-08', motivo: 'Inmaculada Concepción' },
      { fecha: '2026-12-25', motivo: 'Navidad' },
      { fecha: '2027-01-01', motivo: 'Año Nuevo' },
    ]);
  });

  it('resume cada categoría en su cabecera', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /Campañas.*Lun–Sáb 08:00–19:00/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Respuestas de asesores.*Sin restricción/ })).toBeInTheDocument();
  });

  it('valida en línea con las reglas del backend y no guarda con errores', async () => {
    renderPage();
    await abrirCampanas();

    const hasta = screen.getByLabelText('Lunes, franja 1: hasta');
    await userEvent.clear(hasta);
    await userEvent.type(hasta, '25:00');
    expect(screen.getByText('Usa HH:mm (00:00–24:00).')).toBeInTheDocument();

    await userEvent.clear(hasta);
    await userEvent.type(hasta, '08:00');
    expect(screen.getByText('El inicio y el fin no pueden ser iguales.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('detecta un solape con la cola de una franja que cruza la medianoche', async () => {
    renderPage();
    await abrirCampanas();

    const viernesHasta = screen.getByLabelText('Viernes, franja 1: hasta');
    await userEvent.clear(viernesHasta);
    await userEvent.type(viernesHasta, '09:00');
    const viernesDesde = screen.getByLabelText('Viernes, franja 1: desde');
    await userEvent.clear(viernesDesde);
    await userEvent.type(viernesDesde, '22:00');

    // 22:00–09:00 del viernes termina el sábado y choca con el sábado 08:00–19:00.
    expect(screen.getByText('Termina el sábado a las 09:00.')).toBeInTheDocument();
    expect(screen.getByText('Las franjas 1 y 2 se solapan el sábado.')).toBeInTheDocument();
  });

  it('«Copiar a todos los días» lleva el horario del día a la semana entera y se guarda agrupado', async () => {
    renderPage();
    await abrirCampanas();

    // El domingo empieza sin envíos.
    expect(screen.queryByLabelText('Domingo, franja 1: desde')).not.toBeInTheDocument();
    const filaLunes = screen.getByLabelText('Lunes, franja 1: desde').closest('li')!;
    await userEvent.click(within(filaLunes).getByRole('button', { name: /Copiar a todos los días/ }));
    expect(screen.getByLabelText('Domingo, franja 1: desde')).toHaveValue('08:00');

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(reglaGuardada('campana')?.franjas).toEqual([
      { dias: [1, 2, 3, 4, 5, 6, 0], desde: '08:00', hasta: '19:00' },
    ]);
  });

  it('importa festivos sin duplicar los que ya están', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Importar festivos/ }));

    const dialogo = await screen.findByRole('dialog');
    expect(await within(dialogo).findByText('Inmaculada Concepción')).toBeInTheDocument();
    expect(within(dialogo).getByText('Ya está')).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar 2 fechas' }));

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const enviada = mockSave.mock.calls[0]?.[0] as PoliticaVentana;
    expect(enviada.excepciones.map((e) => e.fecha).sort()).toEqual(['2026-12-08', '2026-12-25', '2027-01-01']);
    expect(enviada.excepciones.find((e) => e.fecha === '2027-01-01')).toMatchObject({
      tipo: 'cerrado',
      origen: 'festivo',
      motivo: 'Año Nuevo',
    });
  });
});
