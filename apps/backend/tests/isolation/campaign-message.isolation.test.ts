/**
 * HU-MARK-05 — el hilo de la bandeja con mensajes de campaña: orden cronológico, nombre de la
 * campaña resuelto, y ninguna campaña de otro tenant asomando por un `campaignId` cruzado.
 */
import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../../src/features/cliente/cliente.model.js';
import { Campaign } from '../../src/features/campaign/campaign.model.js';
import { Message } from '../../src/features/message/message.model.js';
import { createScoped } from '../../src/repositories/base.repository.js';

vi.mock('../../src/realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

const { getThread } = await import('../../src/features/conversation/conversation.service.js');

async function crearCliente(tenantId: Types.ObjectId): Promise<Types.ObjectId> {
  const cliente = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${String(new Types.ObjectId())}`,
    telefono: '573001112233',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
  });
  return cliente._id as Types.ObjectId;
}

async function crearCampana(tenantId: Types.ObjectId, nombre: string): Promise<Types.ObjectId> {
  const campana = await createScoped(Campaign, tenantId, {
    nombre,
    filtros: {},
    templateId: new Types.ObjectId(),
    parametros: [],
    creadaPor: new Types.ObjectId(),
  });
  return campana._id as Types.ObjectId;
}

function mensaje(
  clienteId: Types.ObjectId,
  createdAt: Date,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return { clienteId, canal: 'whatsapp', status: 'sent', createdAt, ...extra };
}

describe('HU-MARK-05 — mensajes de campaña en el hilo', () => {
  it('devuelve campaña, IA, cliente y asesor en orden cronológico, con el nombre de la campaña', async () => {
    const tenantId = new Types.ObjectId();
    const clienteId = await crearCliente(tenantId);
    const campaignId = await crearCampana(tenantId, 'Promo sábado');
    const t = (min: number): Date => new Date(Date.UTC(2026, 9, 1, 10, min));

    await createScoped(
      Message,
      tenantId,
      mensaje(clienteId, t(0), {
        direccion: 'outbound',
        sender: 'bot',
        tipo: 'plantilla',
        texto: 'Hola Ana, tenemos cupos',
        origen: 'campana',
        campaignId,
        plantilla: { templateId: new Types.ObjectId(), nombre: 'promo', idioma: 'es', parametros: [] },
        metaMessageId: 'wamid.C1',
      }),
    );
    await createScoped(
      Message,
      tenantId,
      mensaje(clienteId, t(1), { direccion: 'inbound', sender: 'user', tipo: 'texto', texto: 'Info' }),
    );
    await createScoped(
      Message,
      tenantId,
      mensaje(clienteId, t(2), { direccion: 'outbound', sender: 'bot', tipo: 'texto', texto: 'Claro' }),
    );
    await createScoped(
      Message,
      tenantId,
      mensaje(clienteId, t(3), { direccion: 'outbound', sender: 'agent', tipo: 'texto', texto: 'Te llamo' }),
    );

    const hilo = await getThread(tenantId.toString(), clienteId.toString(), { page: 1, limit: 50 });

    expect(hilo.data.map((m) => m.texto)).toEqual([
      'Hola Ana, tenemos cupos',
      'Info',
      'Claro',
      'Te llamo',
    ]);
    expect(hilo.data[0]).toMatchObject({
      origen: 'campana',
      campana: { id: campaignId.toString(), nombre: 'Promo sábado' },
      plantilla: { nombre: 'promo' },
    });
    // El resto no arrastra datos de campaña.
    expect(hilo.data.slice(1).every((m) => m.origen === null && m.campana === null)).toBe(true);
  });

  it('una campaña borrada deja la etiqueta sin nombre, sin romper el hilo', async () => {
    const tenantId = new Types.ObjectId();
    const clienteId = await crearCliente(tenantId);
    const campaignId = new Types.ObjectId();
    await createScoped(
      Message,
      tenantId,
      mensaje(clienteId, new Date(), {
        direccion: 'outbound',
        sender: 'bot',
        tipo: 'plantilla',
        texto: 'Hola',
        origen: 'campana',
        campaignId,
      }),
    );

    const hilo = await getThread(tenantId.toString(), clienteId.toString(), { page: 1, limit: 50 });

    expect(hilo.data[0]?.campana).toEqual({ id: campaignId.toString(), nombre: null });
  });

  it('AISLAMIENTO: un campaignId de otro tenant no resuelve su nombre', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const clienteA = await crearCliente(tenantA);
    const campanaDeB = await crearCampana(tenantB, 'Secreta de B');

    // Un documento corrupto que apunta a la campaña de otra empresa no debe filtrar su nombre.
    await createScoped(
      Message,
      tenantA,
      mensaje(clienteA, new Date(), {
        direccion: 'outbound',
        sender: 'bot',
        tipo: 'plantilla',
        texto: 'Hola',
        origen: 'campana',
        campaignId: campanaDeB,
      }),
    );

    const hilo = await getThread(tenantA.toString(), clienteA.toString(), { page: 1, limit: 50 });

    expect(hilo.data[0]?.campana).toEqual({ id: campanaDeB.toString(), nombre: null });
    expect(JSON.stringify(hilo)).not.toContain('Secreta de B');
  });
});
