import { describe, it, expect, beforeEach, vi } from 'vitest';

// `publishRealtime` abre una conexión a Redis y, sin broker escuchando, la promesa nunca resuelve
// y el test agota su timeout. Es el mismo mock que ya usan los demás tests de conversación.
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Tag } from '../tag/tag.model.js';
import * as tagService from '../tag/tag.service.js';
import { createTag } from '../tag/tag.service.js';
import { listConversations, setConversationTags } from './conversation.service.js';

const tenant = new Types.ObjectId();
const tenantStr = tenant.toString();
const asesor = new Types.ObjectId().toString();
const otroAsesor = new Types.ObjectId();

const queryBase = { page: 1, limit: 20, filtro: 'todos' as const };

async function crearCliente(
  metaUserId: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const doc = await createScoped(Cliente, tenant, {
    metaUserId,
    telefono: `5730011122${metaUserId.slice(-2)}`,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: [],
    ultimoMensajeAt: new Date(),
    ...extra,
  });
  return String(doc._id);
}

describe('HU-OMNI-04 — etiquetas en la conversación', () => {
  beforeEach(async () => {
    await Tag.deleteMany({});
    await Cliente.deleteMany({});
    await Tag.syncIndexes();
    vi.restoreAllMocks();
  });

  it('reemplaza el conjunto: aplicar y quitar varias en una sola llamada', async () => {
    const a = await createTag(tenant, { nombre: 'A', color: '#2563EB' });
    const b = await createTag(tenant, { nombre: 'B', color: '#DC2626' });
    const c = await createTag(tenant, { nombre: 'C', color: '#16A34A' });
    const cliente = await crearCliente('wa_tags_01');

    await setConversationTags(tenantStr, cliente, [a.id, b.id]);
    const conB = await setConversationTags(tenantStr, cliente, [b.id, c.id]);

    // `a` se fue y `c` entró en la misma operación.
    expect(conB.tags.map((t) => t.id).sort()).toEqual([b.id, c.id].sort());
  });

  it('un array vacío deja la conversación sin etiquetas', async () => {
    const a = await createTag(tenant, { nombre: 'A', color: '#2563EB' });
    const cliente = await crearCliente('wa_tags_02');

    await setConversationTags(tenantStr, cliente, [a.id]);
    const limpia = await setConversationTags(tenantStr, cliente, []);

    expect(limpia.tags).toEqual([]);
  });

  it('deduplica ids repetidos', async () => {
    const a = await createTag(tenant, { nombre: 'A', color: '#2563EB' });
    const cliente = await crearCliente('wa_tags_03');

    const res = await setConversationTags(tenantStr, cliente, [a.id, a.id, a.id]);
    expect(res.tags).toHaveLength(1);
  });

  it('404 si la conversación no es del tenant', async () => {
    const ajeno = new Types.ObjectId().toString();
    await expect(setConversationTags(tenantStr, ajeno, [])).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('filtra la bandeja por etiqueta', async () => {
    const a = await createTag(tenant, { nombre: 'A', color: '#2563EB' });
    const b = await createTag(tenant, { nombre: 'B', color: '#DC2626' });
    const conA = await crearCliente('wa_tags_04');
    await crearCliente('wa_tags_05');
    await setConversationTags(tenantStr, conA, [a.id]);

    const soloA = await listConversations(tenantStr, asesor, { ...queryBase, etiqueta: a.id });
    expect(soloA.total).toBe(1);
    expect(soloA.data[0]?.id).toBe(conA);

    const soloB = await listConversations(tenantStr, asesor, { ...queryBase, etiqueta: b.id });
    expect(soloB.total).toBe(0);
  });

  it('el filtro de etiqueta se combina con estado y responsable sin romperlos', async () => {
    const a = await createTag(tenant, { nombre: 'A', color: '#2563EB' });

    const objetivo = await crearCliente('wa_tags_06', {
      estadoComercial: 'pagado',
      asesorId: otroAsesor,
    });
    // Mismo tag, pero distinto estado → no debe salir al combinar.
    const distractor = await crearCliente('wa_tags_07', {
      estadoComercial: 'nuevo',
      asesorId: otroAsesor,
    });
    await setConversationTags(tenantStr, objetivo, [a.id]);
    await setConversationTags(tenantStr, distractor, [a.id]);

    const res = await listConversations(tenantStr, asesor, {
      ...queryBase,
      etiqueta: a.id,
      estado: 'pagado',
      asignadoA: otroAsesor.toString(),
    });

    expect(res.total).toBe(1);
    expect(res.data[0]?.id).toBe(objetivo);
  });

  it('hidrata las etiquetas de toda la página en UNA consulta, no una por conversación', async () => {
    const a = await createTag(tenant, { nombre: 'A', color: '#2563EB' });
    for (let i = 0; i < 5; i += 1) {
      const id = await crearCliente(`wa_tags_1${i}`);
      await setConversationTags(tenantStr, id, [a.id]);
    }

    const spy = vi.spyOn(tagService, 'findTagsByIds');
    const res = await listConversations(tenantStr, asesor, queryBase);

    expect(res.data).toHaveLength(5);
    expect(res.data.every((c) => c.tags.length === 1)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('la bandeja devuelve el color de la etiqueta para pintar el chip', async () => {
    const a = await createTag(tenant, { nombre: 'Urgente', color: '#DC2626' });
    const cliente = await crearCliente('wa_tags_20');
    await setConversationTags(tenantStr, cliente, [a.id]);

    const res = await listConversations(tenantStr, asesor, queryBase);
    expect(res.data[0]?.tags[0]).toMatchObject({ nombre: 'Urgente', color: '#DC2626' });
  });
});
