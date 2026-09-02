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

    // `semaforoIA` se suma en HU-IA-05: viaja aquí para que la franja de intención no necesite un
    // segundo viaje. El hilo sigue fuera, que es lo que este test protege.
    expect(Object.keys(overview).sort()).toEqual([
      'conversation',
      'permisos',
      'resumen',
      'semaforoIA',
    ]);
  });

  // ─── semaforoIA (HU-IA-05) ────────────────────────────────────────────────
  it('semaforoIA null cuando la IA nunca clasificó (AC18)', async () => {
    const clienteId = await crearCliente(tenantA);

    const overview = await getConversationOverview(tenantA.toString(), clienteId, true);

    expect(overview.semaforoIA).toBeNull();
  });

  it('semaforoIA llega con la etiqueta hidratada y `pendiente` resuelto (AC18)', async () => {
    const verde = await Tag.create({
      tenantId: tenantA,
      nombre: 'Avanza',
      color: '#16A34A',
      semaforo: 'verde',
    });
    const clienteId = await crearCliente(tenantA, {
      tagIds: [verde._id],
      semaforoIA: {
        slug: 'verde',
        confianza: 0.9,
        motivo: 'pide instrucciones de pago',
        nivelInteres: 'caliente',
        objecion: null,
        at: new Date(),
        aplicado: 'verde',
      },
    });

    const overview = await getConversationOverview(tenantA.toString(), clienteId, true);

    expect(overview.semaforoIA).toMatchObject({
      slug: 'verde',
      motivo: 'pide instrucciones de pago',
      aplicado: 'verde',
      pendiente: false,
    });
    // Hidratada con el nombre y el color del tenant: el admin pudo renombrarla.
    expect(overview.semaforoIA?.tag).toMatchObject({ nombre: 'Avanza', color: '#16A34A' });
  });

  it('una sugerencia sin aplicar llega como pendiente (AC18)', async () => {
    await Tag.create({ tenantId: tenantA, nombre: 'Avanza', color: '#16A34A', semaforo: 'verde' });
    const clienteId = await crearCliente(tenantA, {
      semaforoIA: {
        slug: 'verde',
        confianza: 0.3,
        motivo: 'parece interesado',
        nivelInteres: 'caliente',
        objecion: null,
        at: new Date(),
        aplicado: null,
      },
    });

    const overview = await getConversationOverview(tenantA.toString(), clienteId, true);

    expect(overview.semaforoIA?.pendiente).toBe(true);
  });

  it('sugerencia hacia una etiqueta borrada: ni tag ni pendiente (AC7)', async () => {
    // Sin sembrar la etiqueta: el admin la borró desde /etiquetas. Ofrecer "Aplicar" daría un 409.
    const clienteId = await crearCliente(tenantA, {
      semaforoIA: {
        slug: 'verde',
        confianza: 0.9,
        motivo: 'quiere pagar',
        nivelInteres: 'caliente',
        objecion: null,
        at: new Date(),
        aplicado: null,
      },
    });

    const overview = await getConversationOverview(tenantA.toString(), clienteId, true);

    expect(overview.semaforoIA?.tag).toBeNull();
    expect(overview.semaforoIA?.pendiente).toBe(false);
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
