import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { AppError } from '../../src/utils/AppError.js';
import { Cliente } from '../../src/features/cliente/cliente.model.js';
import { createScoped } from '../../src/repositories/base.repository.js';
import { Message } from '../../src/features/message/message.model.js';

vi.mock('../../src/realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));
vi.mock('../../src/integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: vi.fn(), sendTemplate: vi.fn() },
}));

const { listConversations, markRead, notifyInboundMessage, replyMessage } = await import(
  '../../src/features/conversation/conversation.service.js'
);
const { publishRealtime } = await import('../../src/realtime/realtime.publisher.js');

describe('conversation.service — listConversations', () => {
  const tenantId = new Types.ObjectId();
  const asesorId = new Types.ObjectId();

  async function seedCliente(
    metaUserId: string,
    over: Record<string, unknown>,
  ): Promise<Types.ObjectId> {
    const cliente = await Cliente.create({
      tenantId,
      metaUserId,
      telefono: '5210000',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      tags: [],
      ...over,
    });
    return cliente._id as Types.ObjectId;
  }

  it('ordena por ultimoMensajeAt desc y arma el preview con el último mensaje', async () => {
    const viejo = await seedCliente('wa_viejo', { ultimoMensajeAt: new Date(Date.now() - 60_000) });
    const nuevo = await seedCliente('wa_nuevo', { ultimoMensajeAt: new Date() });

    await createScoped(Message, tenantId, {
      clienteId: nuevo,
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'texto',
      texto: 'último del nuevo',
      status: 'sent',
    });
    await createScoped(Message, tenantId, {
      clienteId: viejo,
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'texto',
      texto: 'del viejo',
      status: 'sent',
    });

    const res = await listConversations(tenantId.toString(), asesorId.toString(), {
      page: 1,
      limit: 20,
      filtro: 'todos',
    });

    expect(res.total).toBe(2);
    expect(res.data[0]?.id).toBe(nuevo.toString());
    expect(res.data[0]?.preview).toBe('último del nuevo');
    expect(res.data[1]?.id).toBe(viejo.toString());
  });

  it('filtra mios / sin_asignar / sofi', async () => {
    await seedCliente('wa_mio', { asesorId, iaHabilitada: true, ultimoMensajeAt: new Date() });
    await seedCliente('wa_libre', {
      iaHabilitada: false,
      ultimoMensajeAt: new Date(),
    });

    const mios = await listConversations(tenantId.toString(), asesorId.toString(), {
      page: 1,
      limit: 20,
      filtro: 'mios',
    });
    expect(mios.data).toHaveLength(1);
    expect(mios.data[0]?.asesorId).toBe(asesorId.toString());

    const sinAsignar = await listConversations(tenantId.toString(), asesorId.toString(), {
      page: 1,
      limit: 20,
      filtro: 'sin_asignar',
    });
    expect(sinAsignar.data).toHaveLength(1);
    expect(sinAsignar.data[0]?.asesorId).toBeNull();

    const sofi = await listConversations(tenantId.toString(), asesorId.toString(), {
      page: 1,
      limit: 20,
      filtro: 'sofi',
    });
    expect(sofi.data).toHaveLength(1);
    expect(sofi.data[0]?.iaHabilitada).toBe(true);
  });
});

describe('conversation.service — markRead', () => {
  const tenantId = new Types.ObjectId();

  it('deja noLeidos en 0', async () => {
    const cliente = await Cliente.create({
      tenantId,
      metaUserId: 'wa_unread',
      telefono: '5210001',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      noLeidos: 7,
      customFields: {},
      tags: [],
    });

    const conv = await markRead(tenantId.toString(), (cliente._id as Types.ObjectId).toString());
    expect(conv.noLeidos).toBe(0);

    const fresco = await Cliente.findById(cliente._id).lean();
    expect(fresco?.noLeidos).toBe(0);
  });
});

describe('conversation.service — replyMessage (ventana 24h)', () => {
  const tenantId = new Types.ObjectId();

  it('fuera de la ventana → AppError 422 (regla de HT-WA-01)', async () => {
    const cliente = await Cliente.create({
      tenantId,
      metaUserId: 'wa_cerrada',
      telefono: '5210002',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      ventana24hExpiraEn: new Date(Date.now() - 1000),
      customFields: {},
      tags: [],
    });

    let caught: unknown;
    try {
      await replyMessage(tenantId.toString(), (cliente._id as Types.ObjectId).toString(), 'Hola');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).statusCode).toBe(422);
  });
});

describe('conversation.service — preview en vivo de un mensaje sin texto (HU-OMNI-06)', () => {
  const tenantId = new Types.ObjectId();

  it('una imagen sin pie de foto NO deja la conversación en blanco en la lista', async () => {
    const cliente = await Cliente.create({
      tenantId,
      metaUserId: 'wa_preview_media',
      telefono: '5210003',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      tags: [],
    });
    const clienteId = (cliente._id as Types.ObjectId).toString();

    const msg = await createScoped(Message, tenantId, {
      clienteId: cliente._id,
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'imagen',
      media: { estado: 'pendiente', mimeType: 'image/jpeg', metaMediaId: 'm1' },
      status: 'sent',
    });

    vi.mocked(publishRealtime).mockClear();
    await notifyInboundMessage(
      tenantId.toString(),
      clienteId,
      msg as unknown as Parameters<typeof notifyInboundMessage>[2],
    );

    // Pasar `message.texto` crudo (null) dejaba la fila vacía hasta el siguiente refetch, que sí
    // calculaba la etiqueta. El evento en vivo tiene que decir lo mismo que `listConversations`.
    const evt = vi.mocked(publishRealtime).mock.calls[0]?.[0] as {
      conversation: { preview: string | null };
    };
    expect(evt.conversation.preview).toBe('📷 Imagen');
  });

  it('si la imagen trae pie de foto, gana el texto del cliente', async () => {
    const cliente = await Cliente.create({
      tenantId,
      metaUserId: 'wa_preview_caption',
      telefono: '5210004',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      tags: [],
    });

    const msg = await createScoped(Message, tenantId, {
      clienteId: cliente._id,
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'imagen',
      texto: '¿Cuánto vale esto?',
      media: { estado: 'pendiente', mimeType: 'image/jpeg', metaMediaId: 'm2' },
      status: 'sent',
    });

    vi.mocked(publishRealtime).mockClear();
    await notifyInboundMessage(
      tenantId.toString(),
      (cliente._id as Types.ObjectId).toString(),
      msg as unknown as Parameters<typeof notifyInboundMessage>[2],
    );

    const evt = vi.mocked(publishRealtime).mock.calls[0]?.[0] as {
      conversation: { preview: string | null };
    };
    expect(evt.conversation.preview).toBe('¿Cuánto vale esto?');
  });
});
