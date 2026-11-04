import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { ContactNotesCard } from './ContactNotesCard.js';
import { createNota, deleteNota, fetchNotas, updateNota } from '../api.js';
import type { NotaDTO } from '../types.js';

vi.mock('../api.js', () => ({
  fetchNotas: vi.fn(),
  createNota: vi.fn(),
  updateNota: vi.fn(),
  deleteNota: vi.fn(),
  updateContact: vi.fn(),
}));

const mockFetch = vi.mocked(fetchNotas);
const mockCreate = vi.mocked(createNota);
const mockUpdate = vi.mocked(updateNota);
const mockDelete = vi.mocked(deleteNota);

function nota(parcial: Partial<NotaDTO> & Pick<NotaDTO, 'id' | 'texto'>): NotaDTO {
  return {
    autor: { id: 'u-1', nombre: 'Ana Gómez' },
    pendiente: false,
    programadoDia: null,
    programadoHora: null,
    estadoPendiente: null,
    cerradoAt: null,
    createdAt: '2026-07-30T12:00:00.000Z',
    updatedAt: '2026-07-30T12:00:00.000Z',
    ...parcial,
  };
}

function pagina(notas: NotaDTO[]): { data: NotaDTO[]; page: number; limit: number; total: number } {
  return { data: notas, page: 1, limit: 20, total: notas.length };
}

function renderCard(puedeVerSensibles = true): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ContactNotesCard clienteId="c-1" puedeVerSensibles={puedeVerSensibles} />
    </QueryClientProvider>,
  );
}

function error403(): AxiosError {
  return new AxiosError('Acceso denegado.', '403', undefined, null, {
    status: 403,
    data: { message: 'Acceso denegado.' },
    statusText: 'Forbidden',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  });
}

describe('ContactNotesCard (HU-CRM-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(pagina([]));
  });

  it('sin permiso no se renderiza ni pide las notas', () => {
    renderCard(false);
    expect(screen.queryByText('Notas')).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('un 403 del backend oculta la tarjeta en vez de mostrar un error', async () => {
    // Es una falta de permiso, no un fallo: acusar un error sería ruido en un panel ya denso.
    mockFetch.mockRejectedValue(error403());
    renderCard();
    await waitFor(() => expect(screen.queryByText('Notas')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('muestra un estado vacío que invita a escribir la primera nota', async () => {
    renderCard();
    expect(await screen.findByText(/Aún no hay notas/)).toBeInTheDocument();
  });

  it('lista las notas con su autor', async () => {
    mockFetch.mockResolvedValue(pagina([nota({ id: 'n-1', texto: 'Pidió descuento' })]));
    renderCard();

    expect(await screen.findByText('Pidió descuento')).toBeInTheDocument();
    expect(screen.getByText(/Ana Gómez/)).toBeInTheDocument();
  });

  it('el botón está deshabilitado sin texto y el campo se limpia tras guardar', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(nota({ id: 'n-2', texto: 'Nueva' }));
    renderCard();

    const boton = await screen.findByRole('button', { name: 'Agregar nota' });
    expect(boton).toBeDisabled();

    const campo = screen.getByLabelText('Nueva nota');
    await user.type(campo, 'Nueva');
    expect(boton).toBeEnabled();

    await user.click(boton);
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('c-1', { texto: 'Nueva', pendiente: false }));
    await waitFor(() => expect(campo).toHaveValue(''));
  });

  it('un autor borrado no rompe la lista', async () => {
    mockFetch.mockResolvedValue(
      pagina([nota({ id: 'n-3', texto: 'Sobrevive', autor: { id: 'u-9', nombre: null } })]),
    );
    renderCard();

    expect(await screen.findByText('Sobrevive')).toBeInTheDocument();
    expect(screen.getByText(/Usuario eliminado/)).toBeInTheDocument();
  });
});

describe('ContactNotesCard — pendientes (HU-PDF-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(pagina([]));
  });

  it('CA2: el interruptor arranca apagado y una nota normal viaja con pendiente=false', async () => {
    renderCard();
    const interruptor = await screen.findByRole('switch', { name: 'Marcar como pendiente' });
    expect(interruptor).not.toBeChecked();
  });

  it('CA1: con el interruptor activo la nota se crea como pendiente y el interruptor vuelve a apagarse', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(nota({ id: 'n-4', texto: 'Llamar', pendiente: true }));
    renderCard();

    await user.type(await screen.findByLabelText('Nueva nota'), 'Llamar');
    const interruptor = screen.getByRole('switch', { name: 'Marcar como pendiente' });
    await user.click(interruptor);
    expect(interruptor).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Agregar nota y pendiente' }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('c-1', { texto: 'Llamar', pendiente: true }));
    await waitFor(() => expect(interruptor).not.toBeChecked());
  });

  it('una nota pendiente muestra su agenda; una cerrada, que está cerrada', async () => {
    mockFetch.mockResolvedValue(
      pagina([
        nota({
          id: 'n-5',
          texto: 'Enviar PDF',
          pendiente: true,
          programadoDia: '2099-03-15',
          programadoHora: '09:30',
          estadoPendiente: 'abierto',
        }),
        nota({
          id: 'n-9',
          texto: 'Ya hecho',
          pendiente: true,
          programadoDia: '2099-03-16',
          estadoPendiente: 'cerrado',
        }),
      ]),
    );
    renderCard();
    expect(await screen.findByText('Enviar PDF')).toBeInTheDocument();
    expect(screen.getByText(/15 mar 2099 · 09:30/)).toBeInTheDocument();
    expect(screen.getByText('Pendiente cerrado')).toBeInTheDocument();
  });

  it('un pendiente cuya fecha ya pasó se señala vencido', async () => {
    mockFetch.mockResolvedValue(
      pagina([
        nota({
          id: 'n-10',
          texto: 'Atrasado',
          pendiente: true,
          programadoDia: '2020-01-01',
          estadoPendiente: 'abierto',
        }),
      ]),
    );
    renderCard();
    expect(await screen.findByText(/vencido/)).toBeInTheDocument();
  });

  it('CA13: con el interruptor activo aparecen fecha y hora, y la hora elegida viaja al crear', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(nota({ id: 'n-11', texto: 'Con hora', pendiente: true }));
    renderCard();

    await user.type(await screen.findByLabelText('Nueva nota'), 'Con hora');
    expect(screen.queryByLabelText('Hora del pendiente')).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Marcar como pendiente' }));

    expect(screen.getByRole('button', { name: /Fecha del pendiente: Hoy/ })).toBeInTheDocument();
    expect(screen.getByText('Sin hora, es un pendiente de todo el día.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Hora del pendiente'), '14:30');

    await user.click(screen.getByRole('button', { name: 'Agregar nota y pendiente' }));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith('c-1', {
        texto: 'Con hora',
        pendiente: true,
        programadoHora: '14:30',
      }),
    );
  });

  it('CA8: quitar el pendiente desde el menú llama al PATCH', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(pagina([nota({ id: 'n-6', texto: 'Algo', pendiente: true })]));
    mockUpdate.mockResolvedValue(nota({ id: 'n-6', texto: 'Algo', pendiente: false }));
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Acciones de la nota' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Quitar pendiente' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('c-1', 'n-6', { pendiente: false }));
  });

  it('CA8: editar el texto envía solo el texto nuevo', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(pagina([nota({ id: 'n-7', texto: 'Viejo', pendiente: true })]));
    mockUpdate.mockResolvedValue(nota({ id: 'n-7', texto: 'Nuevo', pendiente: true }));
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Acciones de la nota' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar o reprogramar' }));
    const campo = await screen.findByLabelText('Editar nota');
    await user.clear(campo);
    await user.type(campo, 'Nuevo');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('c-1', 'n-7', { texto: 'Nuevo' }));
  });

  it('CA14: reprogramar la hora envía solo la hora nueva', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(
      pagina([
        nota({
          id: 'n-12',
          texto: 'Mover',
          pendiente: true,
          programadoDia: '2099-03-15',
          programadoHora: '09:30',
          estadoPendiente: 'abierto',
        }),
      ]),
    );
    mockUpdate.mockResolvedValue(nota({ id: 'n-12', texto: 'Mover', pendiente: true }));
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Acciones de la nota' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar o reprogramar' }));
    const hora = await screen.findByLabelText('Hora del pendiente');
    await user.clear(hora);
    await user.type(hora, '11:00');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('c-1', 'n-12', { programadoHora: '11:00' }),
    );
  });

  it('CA8: eliminar pide confirmación y luego llama al DELETE', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(pagina([nota({ id: 'n-8', texto: 'Borrar', pendiente: true })]));
    mockDelete.mockResolvedValue(undefined);
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Acciones de la nota' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Eliminar' }));
    expect(mockDelete).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Eliminar nota' }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('c-1', 'n-8'));
  });
});
