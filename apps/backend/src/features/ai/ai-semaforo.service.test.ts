import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

const { mockClassify } = vi.hoisted(() => ({ mockClassify: vi.fn() }));

// El singleton abre Redis al instanciarse; además aquí interesa controlar qué devuelve el modelo.
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ classify: mockClassify }),
}));
// `publishRealtime` se queda esperando indefinidamente si no hay un Redis escuchando: no es lo que
// se está probando y colgaría el test.
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn().mockResolvedValue(undefined),
}));

import { env } from '../../config/env.js';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { IClienteDocument } from '../cliente/cliente.types.js';
import { Tag } from '../tag/tag.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import type { ChatTurn, NivelInteres, Objecion } from '../../integrations/llm/llm-provider.types.js';
import type { SemaforoSlug } from '../tag/tag.types.js';
import {
  aplicarSemaforoSugerido,
  clasificarYAplicarSemaforo,
  listClasificaciones,
} from './ai-semaforo.service.js';
import { semaforoDeClasificacion } from './ai-semaforo.types.js';

const SEMAFORO: { semaforo: SemaforoSlug; nombre: string; color: string }[] = [
  { semaforo: 'verde', nombre: 'Avanza', color: '#16A34A' },
  { semaforo: 'naranja', nombre: 'Requiere atención', color: '#EA580C' },
  { semaforo: 'rojo', nombre: 'En riesgo', color: '#DC2626' },
  { semaforo: 'azul', nombre: 'Informativo', color: '#2563EB' },
];

async function sembrarSemaforo(
  tenantId: Types.ObjectId,
  soloEstos?: SemaforoSlug[],
): Promise<Map<SemaforoSlug, string>> {
  const map = new Map<SemaforoSlug, string>();
  for (const t of SEMAFORO) {
    if (soloEstos && !soloEstos.includes(t.semaforo)) continue;
    const doc = await Tag.create({ tenantId, ...t });
    map.set(t.semaforo, String(doc._id));
  }
  return map;
}

async function crearCliente(tenantId: Types.ObjectId, tagIds: string[] = []): Promise<string> {
  const c = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${new Types.ObjectId().toString()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    iaHabilitada: true,
    tagIds: tagIds.map((id) => new Types.ObjectId(id)),
  });
  return String((c as unknown as IClienteDocument)._id);
}

/** Historial con `n` turnos del cliente, suficientes para pasar la guarda de turnos mínimos. */
function historial(n = 2): ChatTurn[] {
  const turnos: ChatTurn[] = [];
  for (let i = 0; i < n; i += 1) {
    turnos.push({ role: 'user', content: `mensaje ${i}` });
    turnos.push({ role: 'model', content: 'respuesta' });
  }
  turnos.push({ role: 'user', content: 'quiero matricularme, ¿cómo pago?' });
  return turnos;
}

function clasificacion(
  nivelInteres: NivelInteres,
  objecion: Objecion | null,
  confianza = 0.9,
): { data: { nivelInteres: NivelInteres; objecion: Objecion | null; confianza: number; motivo: string } } {
  return {
    data: { nivelInteres, objecion, confianza, motivo: 'pide instrucciones de pago' },
  };
}

async function tagIdsDe(clienteId: string): Promise<string[]> {
  const c = await Cliente.findById(clienteId).lean();
  return (c?.tagIds ?? []).map((id) => String(id));
}

describe('HU-IA-05 — mapeo nivelInteres × objecion → semáforo', () => {
  // Las seis combinaciones del criterio 4. Es la regla de negocio de la historia: se testea sola,
  // sin Mongo de por medio.
  it.each([
    ['caliente', null, 'verde'],
    ['caliente', 'precio', 'verde'],
    ['tibio', null, 'naranja'],
    ['tibio', 'precio', 'naranja'],
    ['frio', null, 'azul'],
    ['frio', 'precio', 'rojo'],
  ] as [NivelInteres, Objecion | null, SemaforoSlug][])(
    '%s + objecion %s → %s',
    (nivel, objecion, esperado) => {
      expect(semaforoDeClasificacion(nivel, objecion)).toBe(esperado);
    },
  );
});

describe('HU-IA-05 — clasificación automática del semáforo', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    tenantId = new Types.ObjectId();
    mockClassify.mockReset();
    await Cliente.deleteMany({});
    await Tag.deleteMany({});
    await AuditEvent.deleteMany({});
  });

  it('intención clara y confianza alta → aplica la etiqueta verde sola (AC5)', async () => {
    const tags = await sembrarSemaforo(tenantId);
    const clienteId = await crearCliente(tenantId);
    mockClassify.mockResolvedValue(clasificacion('caliente', null, 0.92));

    await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial());

    expect(await tagIdsDe(clienteId)).toEqual([tags.get('verde')]);
    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.semaforoIA?.slug).toBe('verde');
    expect(cliente?.semaforoIA?.aplicado).toBe('verde');
    expect(cliente?.semaforoIA?.motivo).toBe('pide instrucciones de pago');
  });

  it('conserva las etiquetas libres y solo sustituye la de semáforo (AC6)', async () => {
    const tags = await sembrarSemaforo(tenantId);
    const libre = await Tag.create({ tenantId, nombre: 'Urgente', color: '#DC2626' });
    const clienteId = await crearCliente(tenantId, [String(libre._id)]);

    // Dos pasos, que es el camino real: primero la IA pinta azul, después el cliente se calienta.
    // Sembrar el azul a mano lo haría contar como intervención humana (AC10) y no se movería.
    mockClassify.mockResolvedValue(clasificacion('frio', null, 0.92));
    await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial());
    expect(await tagIdsDe(clienteId)).toContain(tags.get('azul'));

    mockClassify.mockResolvedValue(clasificacion('caliente', null, 0.92));
    await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial());

    const puestas = await tagIdsDe(clienteId);
    expect(puestas).toContain(String(libre._id));
    expect(puestas).toContain(tags.get('verde'));
    expect(puestas).not.toContain(tags.get('azul'));
  });

  // Una conversación ya etiquetada antes de existir esta historia no lleva `semaforoIA`, así que
  // su semáforo solo pudo ponerlo una persona: la IA lo respeta y se limita a proponer (AC10).
  it('un semáforo previo sin rastro de la IA cuenta como intervención humana (AC10)', async () => {
    const tags = await sembrarSemaforo(tenantId);
    const clienteId = await crearCliente(tenantId, [tags.get('azul') as string]);
    mockClassify.mockResolvedValue(clasificacion('caliente', null, 0.99));

    await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial());

    expect(await tagIdsDe(clienteId)).toEqual([tags.get('azul')]);
    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.semaforoIA?.aplicado).toBeNull();
  });

  it('la etiqueta del slug destino no existe → no escribe, no lanza, deja propuesta (AC7)', async () => {
    // Solo azul sembrada: el admin borró las otras tres.
    await sembrarSemaforo(tenantId, ['azul']);
    const clienteId = await crearCliente(tenantId);
    mockClassify.mockResolvedValue(clasificacion('caliente', null, 0.99));

    await expect(
      clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial()),
    ).resolves.toBeUndefined();

    expect(await tagIdsDe(clienteId)).toEqual([]);
    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.semaforoIA?.slug).toBe('verde');
    expect(cliente?.semaforoIA?.aplicado).toBeNull();
  });

  it('confianza bajo el umbral → propone y no escribe (AC8)', async () => {
    await sembrarSemaforo(tenantId);
    const clienteId = await crearCliente(tenantId);
    mockClassify.mockResolvedValue(clasificacion('caliente', null, env.SEMAFORO_MIN_CONFIANZA - 0.2));

    await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial());

    expect(await tagIdsDe(clienteId)).toEqual([]);
    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.semaforoIA?.slug).toBe('verde');
    expect(cliente?.semaforoIA?.aplicado).toBeNull();
  });

  it('menos turnos del cliente que el mínimo → ni siquiera llama al modelo (AC9)', async () => {
    await sembrarSemaforo(tenantId);
    const clienteId = await crearCliente(tenantId);

    await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, [
      { role: 'user', content: 'hola' },
    ]);

    expect(mockClassify).not.toHaveBeenCalled();
    expect(await tagIdsDe(clienteId)).toEqual([]);
  });

  it('el slug sugerido ya es el vigente → ni escribe ni audita (AC9)', async () => {
    const tags = await sembrarSemaforo(tenantId);
    const clienteId = await crearCliente(tenantId, [tags.get('verde') as string]);
    mockClassify.mockResolvedValue(clasificacion('caliente', null, 0.95));

    await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial());

    expect(await tagIdsDe(clienteId)).toEqual([tags.get('verde')]);
    // Sin esta guarda quedaría un evento idéntico por cada mensaje de la conversación.
    expect(await AuditEvent.countDocuments({ accion: 'cliente.semaforo' })).toBe(0);
  });

  it('semáforo puesto a mano → la IA pasa a proponer y no lo pisa (AC10)', async () => {
    const tags = await sembrarSemaforo(tenantId);
    // Un asesor puso "rojo" a mano: no hay `semaforoIA.aplicado` que lo respalde.
    const clienteId = await crearCliente(tenantId, [tags.get('rojo') as string]);
    mockClassify.mockResolvedValue(clasificacion('caliente', null, 0.99));

    await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial());

    expect(await tagIdsDe(clienteId)).toEqual([tags.get('rojo')]);
    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.semaforoIA?.slug).toBe('verde');
    expect(cliente?.semaforoIA?.aplicado).toBeNull();
  });

  it('SEMAFORO_AUTO=off → no clasifica ni escribe (AC11)', async () => {
    await sembrarSemaforo(tenantId);
    const clienteId = await crearCliente(tenantId);
    const original = env.SEMAFORO_AUTO;
    (env as { SEMAFORO_AUTO: 'on' | 'off' }).SEMAFORO_AUTO = 'off';

    try {
      await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial());
      expect(mockClassify).not.toHaveBeenCalled();
      expect(await tagIdsDe(clienteId)).toEqual([]);
    } finally {
      (env as { SEMAFORO_AUTO: 'on' | 'off' }).SEMAFORO_AUTO = original;
    }
  });

  it('un fallo del clasificador no lanza (AC13)', async () => {
    await sembrarSemaforo(tenantId);
    const clienteId = await crearCliente(tenantId);
    mockClassify.mockRejectedValue(new Error('Gemini caído'));

    await expect(
      clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial()),
    ).resolves.toBeUndefined();
  });

  it('audita el cambio con actorId null y la justificación (AC14)', async () => {
    await sembrarSemaforo(tenantId);
    const clienteId = await crearCliente(tenantId);

    // El camino de la DoD: de Informativo a Avanza, las dos veces por la IA.
    mockClassify.mockResolvedValue(clasificacion('frio', null, 0.9));
    await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial());
    mockClassify.mockResolvedValue(clasificacion('caliente', null, 0.88));
    await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial());

    const eventos = await AuditEvent.find({ accion: 'cliente.semaforo' }).sort({ createdAt: 1 }).lean();
    expect(eventos).toHaveLength(2);
    expect(eventos[0]?.antes).toMatchObject({ semaforo: null });

    const evt = eventos[1];
    expect(evt?.actorId).toBeNull();
    expect(evt?.entidad).toBe('cliente');
    expect(evt?.antes).toMatchObject({ semaforo: 'azul' });
    expect(evt?.despues).toMatchObject({
      semaforo: 'verde',
      aplicado: true,
      confianza: 0.88,
      motivo: 'pide instrucciones de pago',
      nivelInteres: 'caliente',
    });
  });
});

describe('HU-IA-05 — aplicar la sugerencia a mano', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    tenantId = new Types.ObjectId();
    mockClassify.mockReset();
    await Cliente.deleteMany({});
    await Tag.deleteMany({});
    await AuditEvent.deleteMany({});
  });

  it('sin clasificación previa → 409 (AC17)', async () => {
    await sembrarSemaforo(tenantId);
    const clienteId = await crearCliente(tenantId);

    await expect(
      aplicarSemaforoSugerido(tenantId.toString(), clienteId, new Types.ObjectId().toString()),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('aplica la propuesta y la audita con el actor real (AC17)', async () => {
    const tags = await sembrarSemaforo(tenantId);
    const clienteId = await crearCliente(tenantId);
    const actorId = new Types.ObjectId().toString();
    // Confianza baja: queda como propuesta, no se aplica sola.
    mockClassify.mockResolvedValue(clasificacion('caliente', null, 0.1));
    await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial());
    expect(await tagIdsDe(clienteId)).toEqual([]);

    await aplicarSemaforoSugerido(tenantId.toString(), clienteId, actorId);

    expect(await tagIdsDe(clienteId)).toEqual([tags.get('verde')]);
    const evt = await AuditEvent.findOne({ accion: 'cliente.semaforo', actorId }).lean();
    expect(evt).not.toBeNull();
    expect(evt?.despues).toMatchObject({ semaforo: 'verde', aplicado: true });
  });

  it('la sugerencia ya está aplicada → 409', async () => {
    const tags = await sembrarSemaforo(tenantId);
    const clienteId = await crearCliente(tenantId);
    mockClassify.mockResolvedValue(clasificacion('caliente', null, 0.95));
    await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial());
    expect(await tagIdsDe(clienteId)).toEqual([tags.get('verde')]);

    await expect(
      aplicarSemaforoSugerido(tenantId.toString(), clienteId, new Types.ObjectId().toString()),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('HU-IA-05 — bitácora de clasificaciones', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    tenantId = new Types.ObjectId();
    mockClassify.mockReset();
    await Cliente.deleteMany({});
    await Tag.deleteMany({});
    await AuditEvent.deleteMany({});
  });

  it('devuelve solo los eventos de semáforo, no las reasignaciones (AC15)', async () => {
    await sembrarSemaforo(tenantId);
    const clienteId = await crearCliente(tenantId);
    mockClassify.mockResolvedValue(clasificacion('frio', null, 0.9));
    await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial());
    mockClassify.mockResolvedValue(clasificacion('caliente', null, 0.9));
    await clasificarYAplicarSemaforo(tenantId.toString(), clienteId, historial());

    // Ruido de otra acción sobre la MISMA entidad: sin filtro se colaría en la bitácora.
    await createScoped(AuditEvent, tenantId, {
      actorId: new Types.ObjectId(),
      accion: 'conversation.assign',
      entidad: 'cliente',
      entidadId: new Types.ObjectId(clienteId),
      antes: {},
      despues: {},
    });

    const res = await listClasificaciones(tenantId.toString(), clienteId, 1, 20);

    // Dos clasificaciones y CERO reasignaciones: el filtro por acción es lo que las separa.
    expect(res.total).toBe(2);
    expect(res.data[0]).toMatchObject({
      de: 'azul',
      a: 'verde',
      aplicado: true,
      confianza: 0.9,
      motivo: 'pide instrucciones de pago',
      actorId: null,
    });
  });
});
