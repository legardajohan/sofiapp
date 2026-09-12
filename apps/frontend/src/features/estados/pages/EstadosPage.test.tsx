import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EstadosPage } from './EstadosPage.js';
import { deleteEstado, fetchEstados, reorderEstados, updateEstado } from '../api.js';
import type { EstadoDTO } from '../types.js';

vi.mock('../api.js', () => ({
  fetchEstados: vi.fn(),
  createEstado: vi.fn(),
  updateEstado: vi.fn(),
  deleteEstado: vi.fn(),
  reorderEstados: vi.fn(),
}));

const mockFetch = vi.mocked(fetchEstados);
const mockUpdate = vi.mocked(updateEstado);
const mockDelete = vi.mocked(deleteEstado);
const mockReorder = vi.mocked(reorderEstados);

function etapa(parcial: Partial<EstadoDTO> & Pick<EstadoDTO, 'id' | 'key' | 'label'>): EstadoDTO {
  return {
    color: '#2563EB',
    orden: 0,
    activo: true,
    esDefecto: false,
    esSalida: false,
    leads: 0,
    ...parcial,
  };
}

const NUEVO = etapa({ id: 'e1', key: 'nuevo', label: 'Nuevo', leads: 3, esDefecto: true });
const VISITA = etapa({ id: 'e2', key: 'visita-agendada', label: 'Visita agendada', leads: 0 });
const GESTION = etapa({ id: 'e3', key: 'en_gestion', label: 'En gestión', leads: 2 });
const ARCHIVADA = etapa({ id: 'e4', key: 'pago_pendiente', label: 'Pago pendiente', activo: false });

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <EstadosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** El 409 del backend tal como llega por axios, para el caso de carrera. */
function error409(data: Record<string, unknown>): Error {
  return Object.assign(new Error('conflicto'), {
    isAxiosError: true,
    response: { status: 409, data },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue([NUEVO, GESTION, VISITA]);
  mockDelete.mockResolvedValue(undefined);
  mockUpdate.mockResolvedValue({ ...GESTION, activo: false });
  mockReorder.mockResolvedValue([NUEVO, GESTION, VISITA]);
});

describe('EstadosPage — CRUD de las etapas del embudo', () => {
  it('lista las etapas con cuántos leads tiene cada una', async () => {
    renderPage();

    expect(await screen.findByText('Visita agendada')).toBeInTheDocument();
    expect(screen.getByText('3 leads')).toBeInTheDocument();
    expect(screen.getByText('2 leads')).toBeInTheDocument();
    expect(screen.getByText('Sin leads')).toBeInTheDocument();
  });

  it('la etapa de entrada se puede editar pero no eliminar ni archivar', async () => {
    renderPage();

    expect(await screen.findByLabelText('Editar la etapa Nuevo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Eliminar la etapa Nuevo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Archivar la etapa Nuevo')).not.toBeInTheDocument();
  });

  it('siempre confirma antes de eliminar, incluso una etapa vacía', async () => {
    renderPage();

    await userEvent.click(await screen.findByLabelText('Eliminar la etapa Visita agendada'));

    // El diálogo está abierto y NADA se ha borrado: es lo que pide el criterio.
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar etapa' }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('e2'));
  });

  it('cancelar deja la etapa intacta', async () => {
    renderPage();

    await userEvent.click(await screen.findByLabelText('Eliminar la etapa Visita agendada'));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('una etapa con leads no se puede eliminar: lo dice y ofrece archivar', async () => {
    renderPage();

    await userEvent.click(await screen.findByLabelText('Eliminar la etapa En gestión'));

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent('No se puede eliminar «En gestión»');
    expect(dialogo).toHaveTextContent('Hay 2 leads en esta etapa');
    // Sin botón de borrado: el bloqueo se anuncia antes de intentarlo, con la cuenta del listado.
    expect(screen.queryByRole('button', { name: 'Eliminar etapa' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Archivar etapa' }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('e3', { activo: false }),
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('si un lead entra entre la carga y el clic, el 409 convierte el diálogo en el bloqueo', async () => {
    // El listado dice que está vacía, el servidor dice que ya no lo está.
    mockDelete.mockRejectedValue(error409({ motivo: 'en_uso', enUso: 1, message: 'no' }));
    renderPage();

    await userEvent.click(await screen.findByLabelText('Eliminar la etapa Visita agendada'));
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar etapa' }));

    const dialogo = await screen.findByRole('alertdialog');
    // Sigue abierto —no desaparece como si hubiera funcionado— y ahora explica el bloqueo.
    await waitFor(() => expect(dialogo).toHaveTextContent('No se puede eliminar'));
    expect(dialogo).toHaveTextContent('Hay 1 lead en esta etapa');
    expect(screen.getByRole('button', { name: 'Archivar etapa' })).toBeInTheDocument();
  });

  it('una etapa archivada se puede reactivar', async () => {
    mockFetch.mockResolvedValue([NUEVO, { ...GESTION, activo: false }]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /Reactivar/ }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('e3', { activo: true }));
  });

  it('cada etapa activa lleva su asa de arrastre, enfocable con el tabulador', async () => {
    renderPage();

    const asa = await screen.findByLabelText('Reordenar la etapa En gestión');
    expect(asa).toHaveAttribute('aria-roledescription', 'Asa de arrastre');
    // Un `button` real, no un div con listeners: es lo que el sensor de teclado necesita alcanzar.
    expect(asa.tagName).toBe('BUTTON');
  });

  it('reordenar con el teclado guarda el orden completo, archivadas incluidas', async () => {
    mockFetch.mockResolvedValue([NUEVO, GESTION, VISITA, { ...ARCHIVADA }]);
    renderPage();

    const asa = await screen.findByLabelText('Reordenar la etapa En gestión');
    asa.focus();
    // El camino accesible de dnd-kit: Espacio levanta, las flechas mueven, Espacio suelta.
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard(' ');

    await waitFor(() =>
      // «En gestión» sube por delante de «Nuevo»; la archivada va al final de la lista.
      expect(mockReorder).toHaveBeenCalledWith(['e3', 'e1', 'e2', 'e4']),
    );
  });
});
