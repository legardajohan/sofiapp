import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { User } from '../users/user.model.js';
import { Estado } from '../estado/estado.model.js';
import { Tag } from '../tag/tag.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { seedEstados } from '../../seed/seed-estados.js';
import { Lead } from '../lead/lead.model.js';
import { getPipeline } from './pipeline.service.js';
import { PIPELINE_LIMIT_DEFECTO } from './pipeline.types.js';

vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

const tenant = new Types.ObjectId();
const tenantStr = tenant.toString();

let contador = 0;

async function crearAsesor(nombre: string): Promise<string> {
  const doc = await createScoped(User, tenant, {
    nombre,
    email: `${nombre.toLowerCase()}@empresa.test`,
    passwordHash: 'x',
    rol: 'admin',
    activo: true,
  });
  return String(doc._id);
}

/** Un lead directo, sin pasar por la conversión: aquí lo que se prueba es el agrupado. */
async function sembrarLead(opts: {
  estado: string;
  responsableId: string;
  createdAt?: Date;
  tagIds?: Types.ObjectId[];
}): Promise<string> {
  contador += 1;
  const cliente = await createScoped(Cliente, tenant, {
    metaUserId: `wa_pipe_${contador}`,
    telefono: `5730011122${String(contador).padStart(2, '0')}`,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: opts.tagIds ?? [],
  });

  const lead = await createScoped(Lead, tenant, {
    nombre: `Lead ${contador}`,
    telefono: `5730011122${String(contador).padStart(2, '0')}`,
    clienteId: cliente._id,
    estado: opts.estado,
    responsableId: new Types.ObjectId(opts.responsableId),
    origen: {
      tipo: 'conversacion',
      conversacionId: cliente._id,
      convertidoPor: new Types.ObjectId(opts.responsableId),
      convertidoAt: new Date(),
    },
    ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
  });

  if (opts.createdAt) {
    await Lead.updateOne({ _id: lead._id }, { $set: { createdAt: opts.createdAt } });
  }

  return String(lead._id);
}

const query = { limit: PIPELINE_LIMIT_DEFECTO };

describe('HU-PIPE-01 — el embudo agrupado por etapa', () => {
  let asesorA: string;
  let asesorB: string;

  beforeEach(async () => {
    await Lead.deleteMany({});
    await Cliente.deleteMany({});
    await User.deleteMany({});
    await Estado.deleteMany({});
    await Tag.deleteMany({});
    await AuditEvent.deleteMany({});
    await Lead.syncIndexes();
    await Estado.syncIndexes();
    contador = 0;

    await seedEstados(tenant);
    asesorA = await crearAsesor('Carolina');
    asesorB = await crearAsesor('Mateo');
  });

  it('devuelve una columna por etapa activa, en orden de pipeline', async () => {
    const { columnas } = await getPipeline(tenantStr, query);

    expect(columnas.map((c) => c.etapa.key)).toEqual([
      'nuevo',
      'en_gestion',
      'pago_pendiente',
      'pagado',
      'perdido',
      'declinado',
    ]);
  });

  it('agrupa cada lead en la columna de su etapa', async () => {
    await sembrarLead({ estado: 'nuevo', responsableId: asesorA });
    await sembrarLead({ estado: 'nuevo', responsableId: asesorA });
    await sembrarLead({ estado: 'pagado', responsableId: asesorA });

    const { columnas } = await getPipeline(tenantStr, query);
    const porKey = new Map(columnas.map((c) => [c.etapa.key, c]));

    expect(porKey.get('nuevo')?.leads).toHaveLength(2);
    expect(porKey.get('pagado')?.leads).toHaveLength(1);
  });

  it('una etapa sin leads aparece igual, con total 0: la columna vacía es información', async () => {
    await sembrarLead({ estado: 'nuevo', responsableId: asesorA });

    const { columnas } = await getPipeline(tenantStr, query);
    const pagado = columnas.find((c) => c.etapa.key === 'pagado');

    expect(pagado).toBeDefined();
    expect(pagado?.total).toBe(0);
    expect(pagado?.leads).toEqual([]);
  });

  it('una etapa ARCHIVADA no genera columna: no se puede soltar nada ahí', async () => {
    await Estado.updateOne({ tenantId: tenant, key: 'perdido' }, { $set: { activo: false } });

    const { columnas } = await getPipeline(tenantStr, query);

    expect(columnas.map((c) => c.etapa.key)).not.toContain('perdido');
  });

  it('la etapa trae su color y su marca de salida, para que la UI pinte la cabecera', async () => {
    const { columnas } = await getPipeline(tenantStr, query);
    const porKey = new Map(columnas.map((c) => [c.etapa.key, c]));

    expect(porKey.get('declinado')?.etapa.esSalida).toBe(true);
    expect(porKey.get('nuevo')?.etapa.esSalida).toBe(false);
    expect(porKey.get('nuevo')?.etapa.color).toBe('#64748B');
  });

  it('el `total` de la columna es el real, no el número de tarjetas traídas', async () => {
    for (let i = 0; i < 5; i += 1) {
      await sembrarLead({ estado: 'nuevo', responsableId: asesorA });
    }

    const { columnas } = await getPipeline(tenantStr, { limit: 2 });
    const nuevo = columnas.find((c) => c.etapa.key === 'nuevo');

    // La cabecera dice "2 de 5": si el total fuese `leads.length`, mentiría.
    expect(nuevo?.leads).toHaveLength(2);
    expect(nuevo?.total).toBe(5);
  });

  it('ordena las tarjetas por lo más reciente, igual que la tabla', async () => {
    await sembrarLead({
      estado: 'nuevo',
      responsableId: asesorA,
      createdAt: new Date('2026-01-01'),
    });
    await sembrarLead({
      estado: 'nuevo',
      responsableId: asesorA,
      createdAt: new Date('2026-06-01'),
    });

    const { columnas } = await getPipeline(tenantStr, query);
    const nuevo = columnas.find((c) => c.etapa.key === 'nuevo');

    expect(nuevo?.leads[0]?.createdAt.startsWith('2026-06')).toBe(true);
  });

  it('la tarjeta trae el responsable resuelto a nombre, no un ObjectId', async () => {
    await sembrarLead({ estado: 'nuevo', responsableId: asesorA });

    const { columnas } = await getPipeline(tenantStr, query);
    const nuevo = columnas.find((c) => c.etapa.key === 'nuevo');

    expect(nuevo?.leads[0]?.responsable).toEqual({ id: asesorA, nombre: 'Carolina' });
  });

  // ─── Filtros (criterio 2) ────────────────────────────────────────────────────

  it('`asesor` acota todas las columnas y también sus totales', async () => {
    await sembrarLead({ estado: 'nuevo', responsableId: asesorA });
    await sembrarLead({ estado: 'nuevo', responsableId: asesorB });
    await sembrarLead({ estado: 'pagado', responsableId: asesorB });

    const { columnas } = await getPipeline(tenantStr, { ...query, asesor: asesorA });
    const porKey = new Map(columnas.map((c) => [c.etapa.key, c]));

    expect(porKey.get('nuevo')?.total).toBe(1);
    expect(porKey.get('pagado')?.total).toBe(0);
  });

  it('el rango de fechas acota el tablero', async () => {
    await sembrarLead({
      estado: 'nuevo',
      responsableId: asesorA,
      createdAt: new Date('2026-01-15'),
    });
    await sembrarLead({
      estado: 'nuevo',
      responsableId: asesorA,
      createdAt: new Date('2026-06-15'),
    });

    const { columnas } = await getPipeline(tenantStr, {
      ...query,
      desde: new Date('2026-06-01'),
    });

    expect(columnas.find((c) => c.etapa.key === 'nuevo')?.total).toBe(1);
  });

  it('un `semaforo` que no casa con nada deja las columnas vacías pero PRESENTES', async () => {
    await sembrarLead({ estado: 'nuevo', responsableId: asesorA });

    // Sin etiqueta sembrada, el filtro no puede casar con nada. El usuario pidió acotar: debe ver
    // el embudo vacío, no el embudo sin filtrar ni una pantalla en blanco.
    const { columnas } = await getPipeline(tenantStr, { ...query, semaforo: 'verde' });

    expect(columnas).toHaveLength(6);
    expect(columnas.every((c) => c.total === 0 && c.leads.length === 0)).toBe(true);
  });

  it('`semaforo` filtra por la etiqueta de la conversación del lead', async () => {
    const verde = await createScoped(Tag, tenant, {
      nombre: 'Avanza',
      color: '#16A34A',
      semaforo: 'verde',
    });

    await sembrarLead({ estado: 'nuevo', responsableId: asesorA, tagIds: [verde._id] });
    await sembrarLead({ estado: 'nuevo', responsableId: asesorA });

    const { columnas } = await getPipeline(tenantStr, { ...query, semaforo: 'verde' });

    expect(columnas.find((c) => c.etapa.key === 'nuevo')?.total).toBe(1);
  });

  it('devuelve el `limit` aplicado, para que la UI sepa si muestra todo', async () => {
    const { limit } = await getPipeline(tenantStr, { limit: 5 });

    expect(limit).toBe(5);
  });

  it('un tenant sin catálogo de etapas devuelve un tablero vacío, no revienta', async () => {
    await Estado.deleteMany({ tenantId: tenant });

    const pipeline = await getPipeline(tenantStr, query);

    expect(pipeline.columnas).toEqual([]);
  });
});
