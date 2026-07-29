import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
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

const { getContactHistory } = await import('../../src/features/cliente/cliente.service.js');

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('cliente.service — getContactHistory', () => {
  const tenantId = new Types.ObjectId();
  let seq = 0;

  async function seedCliente(over: Record<string, unknown> = {}): Promise<Types.ObjectId> {
    const cliente = await Cliente.create({
      tenantId,
      metaUserId: `wa_hist_${seq++}`,
      telefono: '5211111',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      tags: [],
      ...over,
    });
    return cliente._id as Types.ObjectId;
  }

  async function addMessage(clienteId: Types.ObjectId, texto: string): Promise<void> {
    await createScoped(Message, tenantId, {
      clienteId,
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'text',
      texto,
      status: 'sent',
    });
    await delay(10); // garantiza createdAt estrictamente creciente para el orden del hilo
  }

  it('devuelve la ficha y resumen null cuando no hay resumen previo', async () => {
    const id = await seedCliente({ nombre: 'Ana', ultimoMensajeAt: new Date() });
    const res = await getContactHistory(tenantId.toString(), id.toString(), { page: 1, limit: 50 });

    expect(res.contacto.id).toBe(id.toString());
    expect(res.contacto.nombre).toBe('Ana');
    expect(res.contacto.telefono).toBe('5211111');
    expect(res.resumen).toBeNull();
    expect(res.mensajes.total).toBe(0);
  });

  it('devuelve los mensajes en orden ascendente', async () => {
    const id = await seedCliente({ ultimoMensajeAt: new Date() });
    await addMessage(id, 'm0');
    await addMessage(id, 'm1');
    await addMessage(id, 'm2');

    const res = await getContactHistory(tenantId.toString(), id.toString(), { page: 1, limit: 50 });
    expect(res.mensajes.total).toBe(3);
    expect(res.mensajes.data.map((m) => m.texto)).toEqual(['m0', 'm1', 'm2']);
  });

  it('pagina el historial (página 1 = los más recientes, en ascendente)', async () => {
    const id = await seedCliente({ ultimoMensajeAt: new Date() });
    await addMessage(id, 'm0');
    await addMessage(id, 'm1');
    await addMessage(id, 'm2');

    const res = await getContactHistory(tenantId.toString(), id.toString(), { page: 1, limit: 2 });
    expect(res.mensajes.total).toBe(3);
    expect(res.mensajes.data.map((m) => m.texto)).toEqual(['m1', 'm2']);
  });

  it('marca el resumen desactualizado cuando ultimoMensajeAt > mensajesHasta', async () => {
    const past = new Date(Date.now() - 60_000);
    const id = await seedCliente({
      ultimoMensajeAt: new Date(),
      resumenIA: { texto: 'R', generadoAt: past, mensajesHasta: past, modelo: 'gemini-2.5-flash' },
    });
    const res = await getContactHistory(tenantId.toString(), id.toString(), { page: 1, limit: 50 });
    expect(res.resumen?.desactualizado).toBe(true);
    expect(res.resumen?.texto).toBe('R');
  });

  it('no marca desactualizado si no llegaron mensajes nuevos', async () => {
    const t = new Date();
    const id = await seedCliente({
      ultimoMensajeAt: t,
      resumenIA: { texto: 'R', generadoAt: t, mensajesHasta: t, modelo: 'gemini-2.5-flash' },
    });
    const res = await getContactHistory(tenantId.toString(), id.toString(), { page: 1, limit: 50 });
    expect(res.resumen?.desactualizado).toBe(false);
  });

  it('cliente inexistente → 404', async () => {
    await expect(
      getContactHistory(tenantId.toString(), new Types.ObjectId().toString(), { page: 1, limit: 50 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
