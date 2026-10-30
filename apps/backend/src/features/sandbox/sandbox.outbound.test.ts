/**
 * HU-IA-08, criterios 4 y 10: el canal de salida de la conversación de prueba y sus notificaciones.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

const { sendTextMock, sendTemplateMock, sendMediaMock, publishMock } = vi.hoisted(() => ({
  sendTextMock: vi.fn(),
  sendTemplateMock: vi.fn(),
  sendMediaMock: vi.fn(),
  publishMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: sendTextMock, sendTemplate: sendTemplateMock, sendMedia: sendMediaMock },
}));
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: publishMock,
  subscribeRealtime: vi.fn(),
}));
vi.mock('../../config/queues.js', () => ({
  FLOW_RESUME_JOB: 'resume',
  FLOW_REMINDER_JOB: 'reminder',
  flowRuntimeQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import { Plan } from '../plan/plan.model.js';
import { Tenant } from '../tenant/tenant.model.js';
import { TenantUsage } from '../usage/usage.model.js';
import { getCurrentPeriodo } from '../usage/usage.service.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Notification } from '../notification/notification.model.js';
import { UserModel } from '../users/user.model.js';
import { WhatsAppTemplate } from '../whatsapp-template/whatsapp-template.model.js';
import { sendOutbound } from '../message/message.service.js';
import { assignConversation, handoffConversation } from '../conversation/conversation.service.js';

async function tenantConCuotaAgotada(): Promise<Types.ObjectId> {
  const plan = await Plan.create({
    nombre: 'Básico',
    limites: { usuarios: 3, administradores: 3, mensajesMes: 1, leads: 500, campanasMes: 2 },
    precio: 0,
  });
  const tenant = await Tenant.create({
    nombre: 'Empresa',
    slug: `emp-${new Types.ObjectId()}`,
    contacto: { email: 'e@t.com', telefono: '3000000000' },
    estado: 'activo',
    planId: plan._id,
  });
  await TenantUsage.create({
    tenantId: tenant._id,
    periodo: getCurrentPeriodo(),
    mensajesMes: 1,
    campanasMes: 0,
  });
  return tenant._id as Types.ObjectId;
}

async function crearCliente(
  tenantId: Types.ObjectId,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const doc = await Cliente.create({
    tenantId,
    metaUserId: `x_${new Types.ObjectId()}`,
    telefono: '573001112233',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: [],
    iaHabilitada: true,
    ...extra,
  });
  return String(doc._id);
}

describe('sendOutbound con un cliente de prueba (criterio 4)', () => {
  beforeEach(() => {
    sendTextMock.mockReset();
    sendTemplateMock.mockReset();
    sendMediaMock.mockReset();
    publishMock.mockClear();
  });

  it('no llama a Meta, ignora la cuota agotada y la ventana cerrada, y no consume cuota', async () => {
    const tenantId = await tenantConCuotaAgotada(); // sin integración de WhatsApp tampoco
    const owner = new Types.ObjectId();
    const clienteId = await crearCliente(tenantId, {
      esPrueba: true,
      pruebaOwnerId: owner,
      // ventana de 24 h cerrada
      ventana24hExpiraEn: new Date(Date.now() - 60_000),
    });

    const msg = await sendOutbound(tenantId, clienteId, { modo: 'texto', texto: 'hola desde la prueba' }, 'bot');

    expect(sendTextMock).not.toHaveBeenCalled();
    expect(sendTemplateMock).not.toHaveBeenCalled();
    expect(msg.texto).toBe('hola desde la prueba');
    expect(msg.sender).toBe('bot');
    expect(msg.direccion).toBe('outbound');
    expect(msg.metaMessageId?.startsWith('prueba-')).toBe(true);

    const uso = await TenantUsage.findOne({ tenantId }).lean();
    expect(uso?.mensajesMes).toBe(1);
  });

  it('el modo auto responde con texto aunque la ventana esté cerrada y no haya plantilla de respaldo', async () => {
    const tenantId = await tenantConCuotaAgotada();
    const clienteId = await crearCliente(tenantId, {
      esPrueba: true,
      pruebaOwnerId: new Types.ObjectId(),
      ventana24hExpiraEn: new Date(Date.now() - 60_000),
    });

    const msg = await sendOutbound(tenantId, clienteId, { modo: 'auto', texto: 'hola' }, 'bot');
    expect(msg.tipo).toBe('texto');
    expect(sendTextMock).not.toHaveBeenCalled();
  });

  it('una plantilla se guarda con su texto renderizado, sin enviarse a Meta', async () => {
    const tenantId = await tenantConCuotaAgotada();
    const clienteId = await crearCliente(tenantId, { esPrueba: true, pruebaOwnerId: new Types.ObjectId() });
    const plantilla = await WhatsAppTemplate.create({
      tenantId,
      name: 'saludo',
      language: 'es',
      category: 'UTILITY',
      status: 'APPROVED',
      metaTemplateId: 'meta-1',
      components: [{ type: 'BODY', text: 'Hola {{1}}, bienvenido' }],
      parametrosBody: 1,
    });

    const msg = await sendOutbound(tenantId, clienteId, {
      modo: 'plantilla',
      templateId: String(plantilla._id),
      parametros: ['Ana'],
    });

    expect(sendTemplateMock).not.toHaveBeenCalled();
    expect(msg.tipo).toBe('plantilla');
    expect(msg.texto).toBe('Hola Ana, bienvenido');
  });

  it('enviar media no está disponible en la prueba (422)', async () => {
    const tenantId = await tenantConCuotaAgotada();
    const clienteId = await crearCliente(tenantId, { esPrueba: true, pruebaOwnerId: new Types.ObjectId() });

    await expect(
      sendOutbound(tenantId, clienteId, {
        modo: 'media',
        tipo: 'imagen',
        metaMediaId: 'm',
        mediaKey: 'k',
        mimeType: 'image/png',
        tamanoBytes: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(sendMediaMock).not.toHaveBeenCalled();
  });

  it('un cliente REAL sigue sujeto a la cuota: la prueba no abrió ningún atajo', async () => {
    const tenantId = await tenantConCuotaAgotada();
    const clienteId = await crearCliente(tenantId, { ventana24hExpiraEn: new Date(Date.now() + 60_000) });

    await expect(
      sendOutbound(tenantId, clienteId, { modo: 'texto', texto: 'hola' }),
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(sendTextMock).not.toHaveBeenCalled();
  });
});

describe('notificaciones de la conversación de prueba (criterio 10)', () => {
  beforeEach(() => publishMock.mockClear());

  async function setup() {
    const tenantId = await tenantConCuotaAgotada();
    const owner = await UserModel.create({
      tenantId, nombre: 'Dueña', email: `o-${new Types.ObjectId()}@t.com`, passwordHash: 'h', rol: 'admin', activo: true,
    });
    const asesor = await UserModel.create({
      tenantId, nombre: 'Asesor Real', email: `a-${new Types.ObjectId()}@t.com`, passwordHash: 'h', rol: 'admin', activo: true,
    });
    const clienteId = await crearCliente(tenantId, { esPrueba: true, pruebaOwnerId: owner._id });
    return { tenantId: String(tenantId), owner, asesor, clienteId };
  }

  it('asignar la conversación de prueba NO notifica al asesor: avisa a quien prueba, marcado', async () => {
    const { tenantId, owner, asesor, clienteId } = await setup();

    await assignConversation(tenantId, String(owner._id), clienteId, String(asesor._id));

    expect(await Notification.countDocuments({ userId: asesor._id })).toBe(0);
    const aviso = await Notification.findOne({ userId: owner._id }).lean();
    expect(aviso?.mensaje.startsWith('(prueba)')).toBe(true);

    const tipos = publishMock.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(tipos).not.toContain('conversation:assigned');
    expect(tipos).not.toContain('conversation:updated');
    expect(tipos).toContain('sandbox:effect');
  });

  it('la transferencia (handoff) de la prueba tampoco llega al asesor destino ni a la bandeja', async () => {
    const { tenantId, owner, asesor, clienteId } = await setup();

    await handoffConversation(tenantId, clienteId, 'explicit_request', String(asesor._id), 'fijo');

    expect(await Notification.countDocuments({ userId: asesor._id })).toBe(0);
    const aviso = await Notification.findOne({ userId: owner._id }).lean();
    expect(aviso?.mensaje.startsWith('(prueba)')).toBe(true);

    const tipos = publishMock.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(tipos).not.toContain('conversation:assigned');
    expect(tipos).not.toContain('conversation:updated');
    const efecto = publishMock.mock.calls
      .map((c) => c[0] as { type: string; efecto?: { tipo: string } })
      .find((e) => e.type === 'sandbox:effect');
    expect(efecto?.efecto?.tipo).toBe('handoff');
  });

  it('un cliente real SÍ sigue notificando al asesor (la rama de prueba no cambió lo real)', async () => {
    const { tenantId, owner, asesor } = await setup();
    const realId = await crearCliente(new Types.ObjectId(tenantId));

    await assignConversation(tenantId, String(owner._id), realId, String(asesor._id));

    expect(await Notification.countDocuments({ userId: asesor._id })).toBe(1);
    const tipos = publishMock.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(tipos).toContain('conversation:assigned');
  });
});
