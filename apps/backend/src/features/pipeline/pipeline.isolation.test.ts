import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { User } from '../users/user.model.js';
import { Estado } from '../estado/estado.model.js';
import { Tag } from '../tag/tag.model.js';
import { seedEstados } from '../../seed/seed-estados.js';
import { createEstado } from '../estado/estado.service.js';
import { Lead } from '../lead/lead.model.js';
import { getPipeline } from './pipeline.service.js';
import { PIPELINE_LIMIT_DEFECTO } from './pipeline.types.js';

vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

let contador = 0;

async function crearAsesor(tenantId: Types.ObjectId, email: string): Promise<string> {
  const doc = await createScoped(User, tenantId, {
    nombre: 'Asesor',
    email,
    passwordHash: 'x',
    rol: 'admin',
    activo: true,
  });
  return String(doc._id);
}

async function sembrarLead(
  tenantId: Types.ObjectId,
  estado: string,
  responsableId: string,
  nombre: string,
): Promise<void> {
  contador += 1;
  const cliente = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_iso_${contador}`,
    telefono: `5730011122${String(contador).padStart(2, '0')}`,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: [],
  });

  await createScoped(Lead, tenantId, {
    nombre,
    telefono: `5730011122${String(contador).padStart(2, '0')}`,
    clienteId: cliente._id,
    estado,
    responsableId: new Types.ObjectId(responsableId),
    origen: {
      tipo: 'conversacion',
      conversacionId: cliente._id,
      convertidoPor: new Types.ObjectId(responsableId),
      convertidoAt: new Date(),
    },
  });
}

const query = { limit: PIPELINE_LIMIT_DEFECTO };

describe('HU-PIPE-01 — aislamiento multi-tenant del embudo', () => {
  let asesorA: string;
  let asesorB: string;

  beforeEach(async () => {
    await Lead.deleteMany({});
    await Cliente.deleteMany({});
    await User.deleteMany({});
    await Estado.deleteMany({});
    await Tag.deleteMany({});
    await Lead.syncIndexes();
    await Estado.syncIndexes();
    contador = 0;

    await seedEstados(tenantA);
    await seedEstados(tenantB);
    asesorA = await crearAsesor(tenantA, 'a@empresa-a.test');
    asesorB = await crearAsesor(tenantB, 'b@empresa-b.test');

    await sembrarLead(tenantA, 'nuevo', asesorA, 'Solo de A');
    await sembrarLead(tenantA, 'pagado', asesorA, 'También de A');
  });

  it('el embudo del tenant B no trae NI CUENTA los leads del tenant A', async () => {
    const pipelineB = await getPipeline(tenantB.toString(), query);

    expect(pipelineB.columnas.every((c) => c.leads.length === 0)).toBe(true);
    // El `total` es tan filtrable como las filas: si contara los ajenos, la cabecera del tablero
    // de B anunciaría leads que B no puede ver.
    expect(pipelineB.columnas.every((c) => c.total === 0)).toBe(true);
  });

  it('el dueño SÍ los ve: el vacío de B es aislamiento, no un filtro roto', async () => {
    const pipelineA = await getPipeline(tenantA.toString(), query);
    const porKey = new Map(pipelineA.columnas.map((c) => [c.etapa.key, c]));

    expect(porKey.get('nuevo')?.total).toBe(1);
    expect(porKey.get('nuevo')?.leads[0]?.nombre).toBe('Solo de A');
    expect(porKey.get('pagado')?.total).toBe(1);
  });

  it('las etapas propias del tenant A no aparecen como columnas del tenant B', async () => {
    await createEstado(tenantA.toString(), { label: 'Visita agendada' });

    const pipelineB = await getPipeline(tenantB.toString(), query);

    expect(pipelineB.columnas.map((c) => c.etapa.key)).not.toContain('visita-agendada');
  });

  it('filtrar por un asesor del tenant A desde el tenant B no arrastra nada', async () => {
    // El `asesor` llega por query y es el único filtro que referencia otra colección: es por aquí
    // por donde un id ajeno podría intentar entrar.
    const pipelineB = await getPipeline(tenantB.toString(), { ...query, asesor: asesorA });

    expect(pipelineB.columnas.every((c) => c.total === 0 && c.leads.length === 0)).toBe(true);
  });

  it('el mismo slug de semáforo en los dos tenants no cruza leads', async () => {
    const verdeA = await createScoped(Tag, tenantA, {
      nombre: 'Avanza',
      color: '#16A34A',
      semaforo: 'verde',
    });
    await createScoped(Tag, tenantB, { nombre: 'Avanza', color: '#16A34A', semaforo: 'verde' });

    // La conversación del lead de A lleva la etiqueta verde de A.
    const leadA = await Lead.findOne({ tenantId: tenantA, nombre: 'Solo de A' }).lean();
    await Cliente.updateOne({ _id: leadA?.clienteId }, { $set: { tagIds: [verdeA._id] } });

    const pipelineB = await getPipeline(tenantB.toString(), { ...query, semaforo: 'verde' });
    expect(pipelineB.columnas.every((c) => c.total === 0)).toBe(true);

    const pipelineA = await getPipeline(tenantA.toString(), { ...query, semaforo: 'verde' });
    expect(pipelineA.columnas.find((c) => c.etapa.key === 'nuevo')?.total).toBe(1);
  });

  it('`asesor` del propio tenant sigue funcionando: no se rompió el filtro al aislarlo', async () => {
    await sembrarLead(tenantB, 'nuevo', asesorB, 'De B');

    const pipelineB = await getPipeline(tenantB.toString(), { ...query, asesor: asesorB });

    expect(pipelineB.columnas.find((c) => c.etapa.key === 'nuevo')?.total).toBe(1);
  });
});
