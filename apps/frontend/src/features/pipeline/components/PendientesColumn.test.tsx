import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';
import { DndContext } from '@dnd-kit/core';
import { PendientesColumn } from './PendientesColumn.js';
import { PipelineColumn } from './PipelineColumn.js';
import { cerrarPendiente, fetchPendientes, reabrirPendiente } from '../api.js';
import type { EstadoPendiente, PendienteDTO, PendientesPage, PipelineColumnDTO } from '../types.js';

vi.mock('../api.js', () => ({
  fetchPendientes: vi.fn(),
  cerrarPendiente: vi.fn(),
  reabrirPendiente: vi.fn(),
  downloadPendientesPdf: vi.fn(),
  fetchPipeline: vi.fn(),
  moveLeadStage: vi.fn(),
}));

const mockFetch = vi.mocked(fetchPendientes);
const mockCerrar = vi.mocked(cerrarPendiente);
const mockReabrir = vi.mocked(reabrirPendiente);

function pendiente(
  id: string,
  descripcion: string,
  over: Partial<PendienteDTO> = {},
  lead: Partial<PendienteDTO['lead']> = {},
): PendienteDTO {
  return {
    id,
    clienteId: `cli-${id}`,
    descripcion,
    autor: { id: 'u1', nombre: 'Ana Gómez' },
    createdAt: '2026-10-01T15:00:00.000Z',
    // Lejos en el futuro: así el test no se vuelve «vencido» con el paso del tiempo.
    programadoDia: '2099-03-15',
    programadoHora: '09:30',
    estado: 'abierto',
    cerradoAt: null,
    cerradoPor: null,
    lead: {
      leadId: `lead-${id}`,
      nombre: `Lead ${id}`,
      telefono: '573001112233',
      correo: 'lead@correo.com',
      canalOrigen: 'whatsapp',
      etapa: { key: 'nuevo', label: 'Nuevo', color: '#22C55E' },
      ...lead,
    },
    ...over,
  };
}

function pagina(data: PendienteDTO[]): PendientesPage {
  return { data, page: 1, limit: 20, total: data.length };
}

/** Respuestas por pestaña: abiertos y cerrados vienen de la misma función con otro `estado`. */
function responder(abiertos: PendienteDTO[], cerrados: PendienteDTO[] = []): void {
  mockFetch.mockImplementation((estado: EstadoPendiente) =>
    Promise.resolve(pagina(estado === 'abierto' ? abiertos : cerrados)),
  );
}

/** Pinta la URL actual para comprobar a dónde llevó el clic. */
function Destino(): React.ReactElement {
  const location = useLocation();
  return <p data-testid="destino">{`${location.pathname}${location.search}`}</p>;
}

function pintar(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/leads?vista=embudo']}>
        <Routes>
          <Route path="/leads" element={<PendientesColumn />} />
          <Route path="/inbox" element={<Destino />} />
        </Routes>
      </MemoryRouter>
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

describe('PendientesColumn (HU-PDF-01)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('CA15: respeta el orden de agenda que entrega el backend', async () => {
    responder([pendiente('1', 'Primero'), pendiente('2', 'Segundo'), pendiente('3', 'Tercero')]);
    pintar();

    const columna = await screen.findByRole('region', { name: /Pendientes, 3 abiertos/ });
    const tarjetas = await within(columna).findAllByRole('button', { name: /^Pendiente de/ });
    expect(tarjetas.map((t) => t.getAttribute('aria-label'))).toEqual([
      expect.stringContaining('Primero'),
      expect.stringContaining('Segundo'),
      expect.stringContaining('Tercero'),
    ]);
  });

  it('CA1/CA13: la tarjeta muestra agenda, descripción, lead, contacto, canal, etapa y autor', async () => {
    responder([pendiente('1', 'Llamar el lunes')]);
    pintar();

    expect(await screen.findByText('Llamar el lunes')).toBeInTheDocument();
    expect(screen.getByText(/15 mar 2099 · 09:30/)).toBeInTheDocument();
    expect(screen.getByText('Lead 1')).toBeInTheDocument();
    expect(screen.getByText('573001112233')).toBeInTheDocument();
    expect(screen.getByText('lead@correo.com')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Nuevo')).toBeInTheDocument();
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
  });

  it('un pendiente sin hora dice «Todo el día»; uno ya pasado, «Vencido»', async () => {
    responder([
      pendiente('1', 'Sin hora', { programadoHora: null }),
      pendiente('2', 'Atrasado', { programadoDia: '2020-01-01', programadoHora: null }),
    ]);
    pintar();
    expect(await screen.findByText(/15 mar 2099 · Todo el día/)).toBeInTheDocument();
    expect(screen.getByText('Vencido')).toBeInTheDocument();
  });

  it('un contacto sin lead dice «Sin convertir»', async () => {
    responder([pendiente('1', 'Algo', {}, { leadId: null, etapa: null })]);
    pintar();
    expect(await screen.findByText('Sin convertir')).toBeInTheDocument();
  });

  it('el clic en una tarjeta abre la ficha del contacto en la bandeja, con vuelta al embudo', async () => {
    const user = userEvent.setup();
    responder([pendiente('9', 'Abrir')]);
    pintar();

    await user.click(await screen.findByRole('button', { name: /^Pendiente de Lead 9/ }));
    expect(screen.getByTestId('destino')).toHaveTextContent(
      `/inbox?conversacion=cli-9&volverA=${encodeURIComponent('/leads?vista=embudo')}`,
    );
  });

  it('CA16: «Cerrar pendiente» lo cierra sin abrir la ficha', async () => {
    const user = userEvent.setup();
    responder([pendiente('5', 'Cerrar este')]);
    mockCerrar.mockResolvedValue(pendiente('5', 'Cerrar este', { estado: 'cerrado' }));
    pintar();

    await user.click(await screen.findByRole('button', { name: 'Cerrar pendiente de Lead 5' }));
    await waitFor(() => expect(mockCerrar).toHaveBeenCalledWith('5'));
    expect(screen.queryByTestId('destino')).not.toBeInTheDocument();
  });

  it('CA17: el historial se pide al abrir su pestaña y permite reabrir', async () => {
    const user = userEvent.setup();
    responder(
      [],
      [
        pendiente('7', 'Ya cumplido', {
          estado: 'cerrado',
          cerradoAt: '2026-10-16T14:00:00.000Z',
          cerradoPor: { id: 'u2', nombre: 'Beto Ruiz' },
        }),
      ],
    );
    mockReabrir.mockResolvedValue(pendiente('7', 'Ya cumplido'));
    pintar();

    await screen.findByText(/Sin pendientes abiertos/);
    expect(mockFetch).not.toHaveBeenCalledWith('cerrado', expect.anything(), expect.anything());

    await user.click(screen.getByRole('tab', { name: /Historial/ }));
    expect(await screen.findByText('Ya cumplido')).toBeInTheDocument();
    expect(screen.getByText(/por Beto Ruiz/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Cerrar pendiente/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Reabrir/ }));
    await waitFor(() => expect(mockReabrir).toHaveBeenCalledWith('7'));
  });

  it('CA10: sin permiso (403) la columna no se pinta', async () => {
    mockFetch.mockRejectedValue(error403());
    pintar();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument());
  });

  it('muestra el estado vacío con la indicación para crear un pendiente', async () => {
    responder([]);
    pintar();
    expect(await screen.findByText(/Sin pendientes abiertos/)).toBeInTheDocument();
  });

  it('CA7: «Descargar PDF» está en la columna Pendientes', async () => {
    responder([]);
    pintar();
    expect(await screen.findByRole('button', { name: /Descargar PDF/ })).toBeInTheDocument();
  });
});

describe('CA7 — las columnas de etapa no ofrecen el PDF', () => {
  it('PipelineColumn no tiene «Descargar PDF»', () => {
    const columna: PipelineColumnDTO = {
      etapa: {
        id: 'e1',
        key: 'nuevo',
        label: 'Nuevo',
        color: '#64748B',
        orden: 0,
        activo: true,
        esDefecto: true,
        esSalida: false,
        esConversion: false,
      },
      total: 0,
      leads: [],
    };
    render(
      <DndContext>
        <PipelineColumn columna={columna} onSelect={vi.fn()} onVerEnTabla={vi.fn()} />
      </DndContext>,
    );
    expect(screen.queryByRole('button', { name: /Descargar PDF/ })).not.toBeInTheDocument();
  });
});
