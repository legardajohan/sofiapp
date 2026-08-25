import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: vi.fn(), classify: vi.fn(), summarize: vi.fn() }),
}));

import { getConversationOverview } from './conversation.service.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Tag } from '../tag/tag.model.js';
import { User } from '../users/user.model.js';
import { createScoped } from '../../repositories/base.repository.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

const RESUMEN = 'El cliente pregunta por el curso y dejó su correo diego@empresa.com.';

async function crearCliente(
  tenantId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: `wa-${new Types.ObjectId().toString()}`,
    telefono: '573001112233',
    nombre: 'María Fernanda',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    ...overrides,
  });
  return (doc._id as Types.ObjectId).toString();
}

/** Un cliente con resumen ya generado y al día. */
async function crearConResumen(tenantId: Types.ObjectId): Promise<string> {
  const t = new Date();
  return crearCliente(tenantId, {
    ultimoMensajeAt: t,
    resumenIA: { texto: RESUMEN, generadoAt: t, mensajesHasta: t, modelo: 'gemini-3.6-flash' },
  });
}

beforeEach(async () => {
  await Promise.all([Cliente.deleteMany({}), Tag.deleteMany({}), User.deleteMany({})]);
});

describe('HU-IA-04 — getConversationOverview', () => {
  it('devuelve cabecera, etiquetas hidratadas y resumen con permiso', async () => {
    const tag = await createScoped(Tag, tenantA, { nombre: 'Interesado', color: '#22c55e' });
    const clienteId = await crearCliente(tenantA, {
      ultimoMensajeAt: new Date(),
      tagIds: [tag._id as Types.ObjectId],
      resumenIA: {
        texto: RESUMEN,
        generadoAt: new Date(),
        mensajesHasta: new Date(),
        modelo: 'gemini-3.6-flash',
      },
    });

    const overview = await getConversationOverview(tenantA.toString(), clienteId, true);

    expect(overview.conversation.id).toBe(clienteId);
    expect(overview.conversation.nombre).toBe('María Fernanda');
    // Ya hidratadas por `toConversationResponse` (HU-OMNI-04): la bandeja no hace otra llamada.
    expect(overview.conversation.tags).toHaveLength(1);
    expect(overview.conversation.tags[0]?.nombre).toBe('Interesado');
    expect(overview.resumen?.texto).toBe(RESUMEN);
    expect(overview.permisos.verResumen).toBe(true);
  });

  it('el DTO no incluye el hilo: los mensajes paginan aparte', async () => {
    const clienteId = await crearConResumen(tenantA);

    const overview = await getConversationOverview(tenantA.toString(), clienteId, true);

    expect(Object.keys(overview).sort()).toEqual(['conversation', 'permisos', 'resumen']);
  });

  it('resumen null cuando nunca se generó, aun teniendo permiso', async () => {
    const clienteId = await crearCliente(tenantA);

    const overview = await getConversationOverview(tenantA.toString(), clienteId, true);

    expect(overview.resumen).toBeNull();
    // La diferencia con el caso siguiente es todo el punto: aquí SÍ podría verlo, no hay ninguno.
    expect(overview.permisos.verResumen).toBe(true);
  });

  it('sin permiso oculta el resumen y lo dice en `permisos`', async () => {
    const clienteId = await crearConResumen(tenantA);

    const overview = await getConversationOverview(tenantA.toString(), clienteId, false);

    expect(overview.resumen).toBeNull();
    expect(overview.permisos).toEqual({
      verResumen: false,
      generarResumen: false,
      verSensibles: false,
    });
  });

  it('sin permiso el resto de la vista se sigue viendo entero', async () => {
    // Cerrar la vista entera dejaría a `coordinator` y `secretary` sin cabecera ni etiquetas, que
    // sí les corresponden. El gate es por campo, no por ruta.
    const tag = await createScoped(Tag, tenantA, { nombre: 'Precio', color: '#ef4444' });
    const clienteId = await crearCliente(tenantA, { tagIds: [tag._id as Types.ObjectId] });

    const overview = await getConversationOverview(tenantA.toString(), clienteId, false);

    expect(overview.conversation.nombre).toBe('María Fernanda');
    expect(overview.conversation.tags).toHaveLength(1);
  });

  it('nunca anuncia `verResumen: true` con el resumen oculto por permiso', async () => {
    const clienteId = await crearConResumen(tenantA);

    for (const permiso of [true, false]) {
      const o = await getConversationOverview(tenantA.toString(), clienteId, permiso);
      // Con permiso hay resumen; sin permiso, no lo hay Y se avisa. Lo que no puede pasar es
      // prometer que se puede ver algo que no viene.
      expect(o.permisos.verResumen).toBe(permiso);
      expect(o.resumen !== null).toBe(permiso);
    }
  });

  it('una conversación inexistente → 404', async () => {
    await expect(
      getConversationOverview(tenantA.toString(), new Types.ObjectId().toString(), true),
    ).rejects.toThrow('Conversación no encontrada.');
  });

  it('AISLAMIENTO: la conversación de otro tenant no se encuentra', async () => {
    const clienteDeB = await crearConResumen(tenantB);

    await expect(
      getConversationOverview(tenantA.toString(), clienteDeB, true),
    ).rejects.toThrow('Conversación no encontrada.');
  });

  it('AISLAMIENTO: una etiqueta homónima de otro tenant no se cuela en la vista', async () => {
    const tagA = await createScoped(Tag, tenantA, { nombre: 'Interesado', color: '#22c55e' });
    await createScoped(Tag, tenantB, { nombre: 'Interesado', color: '#000000' });
    const clienteId = await crearCliente(tenantA, { tagIds: [tagA._id as Types.ObjectId] });

    const overview = await getConversationOverview(tenantA.toString(), clienteId, true);

    expect(overview.conversation.tags).toHaveLength(1);
    expect(overview.conversation.tags[0]?.id).toBe((tagA._id as Types.ObjectId).toString());
  });
});
