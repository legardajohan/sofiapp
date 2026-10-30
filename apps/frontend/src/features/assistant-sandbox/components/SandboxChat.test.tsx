/**
 * Chat de prueba (HU-IA-08): lo que ve el admin al conversar con su configuración.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MessageDTO } from '../../inbox/types.js';
import type { SandboxSession } from '../types.js';

type Handler = (evt: unknown) => void;
const handlers = new Map<string, Handler>();
vi.mock('../../../lib/socket.js', () => ({
  getSocket: () => ({
    on: (evento: string, fn: Handler) => handlers.set(evento, fn),
    off: (evento: string) => handlers.delete(evento),
  }),
}));

const { mockSession, mockSend, mockSelect, mockReset, mockAdvance } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockSend: vi.fn(),
  mockSelect: vi.fn(),
  mockReset: vi.fn(),
  mockAdvance: vi.fn(),
}));
vi.mock('../api.js', () => ({
  fetchSandboxSession: mockSession,
  sendSandboxMessage: mockSend,
  selectSandboxFlow: mockSelect,
  resetSandboxSession: mockReset,
  advanceSandboxWait: mockAdvance,
}));
vi.mock('../../flows/hooks/useFlows.js', () => ({
  useFlows: () => ({ data: [{ id: 'f-borrador', nombre: 'Borrador', activo: false }] }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SandboxChat } from './SandboxChat.js';
import { useSandboxStore } from '../useSandboxStore.js';

function mensaje(parcial: Partial<MessageDTO> = {}): MessageDTO {
  return {
    id: 'm-1',
    direccion: 'inbound',
    sender: 'user',
    tipo: 'texto',
    texto: 'Hola',
    media: null,
    previewEnlace: null,
    attachmentUrl: null,
    status: 'sent',
    origen: null,
    campana: null,
    plantilla: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    ...parcial,
  };
}

function sesion(parcial: Partial<SandboxSession> = {}): SandboxSession {
  return {
    clienteId: 'c-1',
    flujo: null,
    flujoActivo: { id: 'f-activo', nombre: 'Bienvenida' },
    iaHabilitada: true,
    esperaPendiente: null,
    mensajes: [],
    ...parcial,
  };
}

function renderChat(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SandboxChat />
    </QueryClientProvider>,
  );
  return client;
}

describe('SandboxChat (HU-IA-08)', () => {
  beforeEach(() => {
    handlers.clear();
    useSandboxStore.getState().limpiar();
    mockSession.mockReset().mockResolvedValue(sesion());
    mockSend.mockReset();
    mockSelect.mockReset();
    mockReset.mockReset();
    mockAdvance.mockReset();
  });

  it('con la conversación vacía invita a escribir y avisa que nada sale por WhatsApp', async () => {
    renderChat();

    expect(await screen.findByText(/escríbele a sofi como lo haría un cliente/i)).toBeInTheDocument();
    expect(screen.getByText(/nada se envía por whatsapp/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quiero hablar con un asesor' })).toBeInTheDocument();
  });

  it('enviar un mensaje lo pinta al instante y la respuesta de Sofi llega por el socket', async () => {
    mockSend.mockResolvedValue(mensaje({ id: 'm-in', texto: '¿Cuánto cuesta?' }));
    const user = userEvent.setup();
    renderChat();

    await user.type(await screen.findByLabelText('Mensaje de prueba'), '¿Cuánto cuesta?{Enter}');

    expect(mockSend).toHaveBeenCalledWith('¿Cuánto cuesta?');
    expect(await screen.findByText('¿Cuánto cuesta?')).toBeInTheDocument();
    expect(screen.getByText(/sofi está escribiendo/i)).toBeInTheDocument();

    act(() => {
      handlers.get('sandbox:message')?.({
        type: 'sandbox:message',
        message: mensaje({
          id: 'm-out',
          direccion: 'outbound',
          sender: 'bot',
          texto: 'Cuesta 100.000',
          createdAt: '2026-10-01T10:00:05.000Z',
        }),
      });
    });

    expect(await screen.findByText('Cuesta 100.000')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/sofi está escribiendo/i)).not.toBeInTheDocument());
  });

  it('no duplica el mensaje que llega por la respuesta HTTP y otra vez por el socket', async () => {
    mockSend.mockResolvedValue(mensaje({ id: 'm-in', texto: 'Hola' }));
    const user = userEvent.setup();
    renderChat();

    await user.type(await screen.findByLabelText('Mensaje de prueba'), 'Hola{Enter}');
    await screen.findByText('Hola');
    act(() => {
      handlers.get('sandbox:message')?.({ type: 'sandbox:message', message: mensaje({ id: 'm-in', texto: 'Hola' }) });
    });

    expect(screen.getAllByText('Hola')).toHaveLength(1);
  });

  it('muestra como tarjeta lo que el sistema hizo durante la prueba', async () => {
    mockSession.mockResolvedValue(sesion({ mensajes: [mensaje()] }));
    renderChat();
    await screen.findByText('Hola');

    act(() => {
      handlers.get('sandbox:effect')?.({
        type: 'sandbox:effect',
        efecto: { tipo: 'lead_creado', leadId: 'l-1', estado: 'nuevo' },
        at: '2026-10-01T10:00:06.000Z',
      });
      handlers.get('sandbox:effect')?.({
        type: 'sandbox:effect',
        efecto: { tipo: 'handoff', motivo: 'explicit_request', asesor: { id: 'u-1', nombre: 'Ana Pérez' } },
        at: '2026-10-01T10:00:07.000Z',
      });
    });

    expect(await screen.findByText(/se creó un lead en la etapa «nuevo»/i)).toBeInTheDocument();
    expect(screen.getByText(/se transferiría a ana pérez a una persona/i)).toBeInTheDocument();
  });

  it('tras una transferencia el campo se bloquea y dice cómo seguir', async () => {
    mockSession.mockResolvedValue(sesion({ iaHabilitada: false, mensajes: [mensaje()] }));
    renderChat();

    const campo = await screen.findByLabelText('Mensaje de prueba');
    expect(campo).toBeDisabled();
    expect(campo).toHaveAttribute('placeholder', expect.stringMatching(/reinicia para volver a probar/i));
  });

  it('«Avanzar ahora» aparece en la espera pendiente y llama al backend', async () => {
    mockSession.mockResolvedValue(
      sesion({ mensajes: [mensaje()], esperaPendiente: { hasta: '2026-10-01T11:00:00.000Z' } }),
    );
    mockAdvance.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderChat();
    await screen.findByText('Hola');

    act(() => {
      handlers.get('sandbox:effect')?.({
        type: 'sandbox:effect',
        efecto: { tipo: 'espera', hasta: '2026-10-01T11:00:00.000Z' },
        at: '2026-10-01T10:00:06.000Z',
      });
    });

    await user.click(await screen.findByRole('button', { name: /avanzar ahora/i }));
    expect(mockAdvance).toHaveBeenCalledTimes(1);
  });

  it('Reiniciar pide confirmación y solo entonces borra la conversación', async () => {
    mockSession.mockResolvedValue(sesion({ mensajes: [mensaje()] }));
    mockReset.mockResolvedValue(sesion());
    const user = userEvent.setup();
    renderChat();
    await screen.findByText('Hola');

    await user.click(screen.getByRole('button', { name: /reiniciar/i }));
    expect(mockReset).not.toHaveBeenCalled();
    expect(await screen.findByText(/¿reiniciar la conversación de prueba\?/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^reiniciar$/i }).at(-1)!);
    await waitFor(() => expect(mockReset).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/escríbele a sofi como lo haría un cliente/i)).toBeInTheDocument();
  });
});
