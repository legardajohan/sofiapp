import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

const { mockClassify } = vi.hoisted(() => ({ mockClassify: vi.fn() }));

// El servicio importa el singleton de AIService, que abre Redis al instanciarse.
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ classify: mockClassify }),
}));
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn().mockResolvedValue(undefined),
}));

import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { IClienteDocument } from '../cliente/cliente.types.js';
import { Tag } from '../tag/tag.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { findSemaforoTags } from '../tag/tag.service.js';
import type { ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import {
  aplicarSemaforoSugerido,
  clasificarYAplicarSemaforo,
  listClasificaciones,
} from './ai-semaforo.service.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

const HISTORIAL: ChatTurn[] = [
  { role: 'user', content: 'hola, ¿cuánto cuesta el curso?' },
  { role: 'model', content: 'cuesta X' },
  { role: 'user', content: 'quiero matricularme, ¿cómo pago?' },
];

async function sembrarSemaforo(tenantId: Types.ObjectId): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const t of [
    { semaforo: 'verde', nombre: 'Avanza', color: '#16A34A' },
    { semaforo: 'azul', nombre: 'Informativo', color: '#2563EB' },
  ]) {
    const doc = await Tag.create({ tenantId, ...t });
    map.set(t.semaforo, String(doc._id));
  }
  return map;
}

async function crearCliente(tenantId: Types.ObjectId): Promise<string> {
  const c = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${new Types.ObjectId().toString()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    iaHabilitada: true,
  });
  return String((c as unknown as IClienteDocument)._id);
}

describe('HU-IA-05 — aislamiento multi-tenant de la semaforización', () => {
  beforeEach(async () => {
    mockClassify.mockReset();
    mockClassify.mockResolvedValue({
      data: { nivelInteres: 'caliente', objecion: null, confianza: 0.95, motivo: 'quiere pagar' },
    });
    await Cliente.deleteMany({});
    await Tag.deleteMany({});
    await AuditEvent.deleteMany({});
  });

  it('findSemaforoTags del tenantB no devuelve las etiquetas del tenantA', async () => {
    await sembrarSemaforo(tenantA);

    expect((await findSemaforoTags(tenantA)).size).toBe(2);
    expect((await findSemaforoTags(tenantB)).size).toBe(0);
  });

  it('clasificar una conversación del tenantA no toca clientes del tenantB', async () => {
    await sembrarSemaforo(tenantA);
    await sembrarSemaforo(tenantB);
    const clienteA = await crearCliente(tenantA);
    const clienteB = await crearCliente(tenantB);

    await clasificarYAplicarSemaforo(tenantA.toString(), clienteA, HISTORIAL);

    const b = await Cliente.findById(clienteB).lean();
    expect(b?.tagIds ?? []).toHaveLength(0);
    expect(b?.semaforoIA).toBeUndefined();
    // Y el evento de auditoría se queda en su tenant.
    expect(await AuditEvent.countDocuments({ tenantId: tenantB })).toBe(0);
    expect(await AuditEvent.countDocuments({ tenantId: tenantA })).toBe(1);
  });

  it('nunca aplica una etiqueta de otro tenant, aunque el slug exista allí', async () => {
    const tagsA = await sembrarSemaforo(tenantA);
    // El tenantB tiene sus propias etiquetas con los mismos slugs: la del A no puede colarse.
    const tagsB = await sembrarSemaforo(tenantB);
    const clienteB = await crearCliente(tenantB);

    await clasificarYAplicarSemaforo(tenantB.toString(), clienteB, HISTORIAL);

    const b = await Cliente.findById(clienteB).lean();
    const puestas = (b?.tagIds ?? []).map((id) => String(id));
    expect(puestas).toEqual([tagsB.get('verde')]);
    expect(puestas).not.toContain(tagsA.get('verde'));
  });

  it('clasificar con el tenant equivocado no encuentra la conversación y no escribe', async () => {
    await sembrarSemaforo(tenantA);
    await sembrarSemaforo(tenantB);
    const clienteA = await crearCliente(tenantA);

    // El worker recibe el `tenantId` del job; si no cuadra con el cliente, `findByIdScoped` no lo
    // encuentra y la función sale sin escribir en ninguno de los dos tenants.
    await clasificarYAplicarSemaforo(tenantB.toString(), clienteA, HISTORIAL);

    const a = await Cliente.findById(clienteA).lean();
    expect(a?.tagIds ?? []).toHaveLength(0);
    expect(a?.semaforoIA).toBeUndefined();
  });

  it('aplicarSemaforoSugerido del tenantB sobre una conversación del tenantA → 404', async () => {
    await sembrarSemaforo(tenantA);
    const clienteA = await crearCliente(tenantA);
    // Confianza baja: queda propuesta pendiente en el tenantA.
    mockClassify.mockResolvedValue({
      data: { nivelInteres: 'caliente', objecion: null, confianza: 0.1, motivo: 'quiere pagar' },
    });
    await clasificarYAplicarSemaforo(tenantA.toString(), clienteA, HISTORIAL);

    await expect(
      aplicarSemaforoSugerido(tenantB.toString(), clienteA, new Types.ObjectId().toString()),
    ).rejects.toMatchObject({ statusCode: 404 });

    const a = await Cliente.findById(clienteA).lean();
    expect(a?.tagIds ?? []).toHaveLength(0);
  });

  it('listClasificaciones del tenantB sobre una conversación del tenantA → 404', async () => {
    await sembrarSemaforo(tenantA);
    const clienteA = await crearCliente(tenantA);
    await clasificarYAplicarSemaforo(tenantA.toString(), clienteA, HISTORIAL);

    await expect(listClasificaciones(tenantB.toString(), clienteA, 1, 20)).rejects.toMatchObject({
      statusCode: 404,
    });

    // Y en su propio tenant sí se lee.
    const propia = await listClasificaciones(tenantA.toString(), clienteA, 1, 20);
    expect(propia.total).toBe(1);
  });
});
