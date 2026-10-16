import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MessageDTO, Paginated, RealtimeMessageUpdatedEvent } from '../types.js';

type Handler = (evt: unknown) => void;
const handlers = new Map<string, Handler>();

vi.mock('../../../lib/socket.js', () => ({
  getSocket: () => ({
    on: (evento: string, fn: Handler) => handlers.set(evento, fn),
    off: (evento: string) => handlers.delete(evento),
  }),
}));

import { useInboxRealtime } from './useInboxRealtime.js';

function mensaje(parcial: Partial<MessageDTO> = {}): MessageDTO {
  return {
    id: 'm-1',
    direccion: 'outbound',
    sender: 'bot',
    tipo: 'plantilla',
    texto: 'Hola Ana',
    media: null,
    previewEnlace: null,
    attachmentUrl: null,
    status: 'sent',
    origen: 'campana',
    campana: { id: 'c-1', nombre: 'Promo' },
    plantilla: { nombre: 'promo' },
    createdAt: '2026-10-01T10:00:00.000Z',
    ...parcial,
  };
}

describe('useInboxRealtime — ticks de entrega en vivo (HU-MARK-05)', () => {
  it('message:updated reemplaza el mensaje en el hilo sin recargarlo', () => {
    const qc = new QueryClient();
    qc.setQueryData<Paginated<MessageDTO>>(['thread', 'cli-1'], {
      data: [mensaje(), mensaje({ id: 'm-2', texto: 'Otro', origen: null, campana: null })],
      page: 1,
      limit: 50,
      total: 2,
    });

    renderHook(() => useInboxRealtime(), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });

    const evento: RealtimeMessageUpdatedEvent = {
      tenantId: 't-1',
      conversationId: 'cli-1',
      message: mensaje({ status: 'read' }),
    };
    act(() => handlers.get('message:updated')?.(evento));

    const hilo = qc.getQueryData<Paginated<MessageDTO>>(['thread', 'cli-1']);
    expect(hilo?.data[0]).toMatchObject({ id: 'm-1', status: 'read', origen: 'campana' });
    expect(hilo?.data[1]).toMatchObject({ id: 'm-2', status: 'sent' });
  });
});
