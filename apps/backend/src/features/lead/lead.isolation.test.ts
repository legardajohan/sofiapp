import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { countScoped, createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Tag } from '../tag/tag.model.js';
import { Semaforo } from '../semaforo/semaforo.model.js';
import { seedSemaforos } from '../../seed/seed-semaforos.js';
import { User } from '../users/user.model.js';
import { listConversations } from '../conversation/conversation.service.js';
import { Lead } from './lead.model.js';
import {
  createLeadFromConversation,
  deleteLead,
  findLeadIdsByClientes,
  getLeadById,
  listHistorialSemaforo,
  listLeads,
  updateLeadEstado,
  updateLeadSemaforo,
} from './lead.service.js';
import type { ILeadLean } from './lead.types.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

async function crearCliente(tenantId: Types.ObjectId, metaUserId: string): Promise<string> {
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId,
    telefono: '573001112233',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: [],
    ultimoMensajeAt: new Date(),
  });
  return String(doc._id);
}

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

const queryBase = { page: 1, limit: 20, filtro: 'todos' as const };

describe('HU-CRM-01 — aislamiento multi-tenant de leads', () => {
  let clienteA: string;
  let asesorA: string;
  let asesorB: string;
  let leadA: string;

  beforeEach(async () => {
    await Lead.deleteMany({});
    await Cliente.deleteMany({});
    await User.deleteMany({});
    await Lead.syncIndexes();

    clienteA = await crearCliente(tenantA, 'wa_iso_a');
    asesorA = await crearAsesor(tenantA, 'a@empresa-a.test');
    asesorB = await crearAsesor(tenantB, 'b@empresa-b.test');

    const lead = await createLeadFromConversation(tenantA.toString(), asesorA, {
      nombre: 'Solo de A',
      telefono: '573001112233',
      clienteId: clienteA,
    });
    leadA = lead.id;
  });

  it('el tenantB no puede leer un lead del tenantA → 404', async () => {
    await expect(getLeadById(tenantB.toString(), leadA)).rejects.toMatchObject({
      statusCode: 404,
    });

    // Y sigue intacto para su dueño.
    const intacto = await findByIdScoped(Lead, tenantA, leadA).lean<ILeadLean>();
    expect(intacto?.nombre).toBe('Solo de A');
  });

  it('el tenantB no puede borrar un lead del tenantA → 404 y el lead SIGUE ahí', async () => {
    // El borrado es la operación más destructiva del feature: que el 404 no sea solo un mensaje,
    // sino que además no haya tocado nada, es lo que hay que probar.
    await expect(deleteLead(tenantB.toString(), asesorB, leadA, 'spam')).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(await countScoped(Lead, tenantA)).toBe(1);
    const intacto = await findByIdScoped(Lead, tenantA, leadA).lean<ILeadLean>();
    expect(intacto?.nombre).toBe('Solo de A');
  });

  it('el tenantB no puede cambiarle el estado a un lead del tenantA → 404 y NO lo toca', async () => {
    // Mover un lead ajeno sería escribir en datos de otra empresa. El 404 tiene que venir además
    // sin haber modificado nada.
    await expect(
      updateLeadEstado(tenantB.toString(), asesorB, leadA, 'pagado'),
    ).rejects.toMatchObject({ statusCode: 404 });

    const intacto = await findByIdScoped(Lead, tenantA, leadA).lean<ILeadLean>();
    expect(intacto?.estado).toBe('nuevo');
  });

  it('crear un lead con un `clienteId` del tenantA desde el tenantB falla SIN escribir', async () => {
    await expect(
      createLeadFromConversation(tenantB.toString(), asesorB, {
        nombre: 'Secuestrado',
        telefono: '573009998877',
        clienteId: clienteA,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    // La comprobación que importa: el rechazo no dejó un lead a medio crear en B.
    expect(await countScoped(Lead, tenantB)).toBe(0);
  });

  it('el mismo teléfono coexiste en dos tenants: la unicidad es por tenant, no global', async () => {
    const clienteB = await crearCliente(tenantB, 'wa_iso_b');

    const leadB = await createLeadFromConversation(tenantB.toString(), asesorB, {
      nombre: 'Solo de B',
      telefono: '573001112233',
      clienteId: clienteB,
    });

    expect(leadB.id).not.toBe(leadA);
    expect(await countScoped(Lead, tenantA)).toBe(1);
    expect(await countScoped(Lead, tenantB)).toBe(1);
  });

  it('`findLeadIdsByClientes` del tenantB no filtra el `leadId` de un cliente del tenantA', async () => {
    const mapa = await findLeadIdsByClientes(tenantB.toString(), [clienteA]);
    expect(mapa.size).toBe(0);

    // Su dueño sí lo ve.
    const mapaA = await findLeadIdsByClientes(tenantA.toString(), [clienteA]);
    expect(mapaA.get(clienteA)).toBe(leadA);
  });

  it('la bandeja del tenantB no muestra el `leadId` de una conversación del tenantA', async () => {
    await crearCliente(tenantB, 'wa_iso_b_bandeja');

    const bandejaB = await listConversations(tenantB.toString(), asesorB, queryBase);
    expect(bandejaB.data).toHaveLength(1);
    expect(bandejaB.data[0]?.leadId).toBeNull();

    const bandejaA = await listConversations(tenantA.toString(), asesorA, queryBase);
    expect(bandejaA.data[0]?.leadId).toBe(leadA);
  });
});

describe('HU-CRM-03 — aislamiento multi-tenant del listado de leads', () => {
  let clienteA: string;
  let asesorA: string;
  let asesorB: string;
  let leadA: string;

  const listQuery = { page: 1, limit: 20 };

  beforeEach(async () => {
    await Lead.deleteMany({});
    await Cliente.deleteMany({});
    await User.deleteMany({});
    await Tag.deleteMany({});
    await Semaforo.deleteMany({});
    await Lead.syncIndexes();

    // Cada empresa tiene SU propio catálogo de semáforos: mismas claves, documentos distintos.
    await seedSemaforos(tenantA);
    await seedSemaforos(tenantB);

    clienteA = await crearCliente(tenantA, 'wa_list_a');
    asesorA = await crearAsesor(tenantA, 'a@list-a.test');
    asesorB = await crearAsesor(tenantB, 'b@list-b.test');

    // Cada empresa tiene SU propia etiqueta "verde": mismo slug, documentos distintos.
    const verdeA = await createScoped(Tag, tenantA, {
      nombre: 'Avanza',
      color: '#16A34A',
      semaforo: 'verde',
    });
    await createScoped(Tag, tenantB, { nombre: 'Avanza', color: '#16A34A', semaforo: 'verde' });

    await Cliente.updateOne({ _id: clienteA }, { $set: { tagIds: [verdeA._id] } });

    const lead = await createLeadFromConversation(tenantA.toString(), asesorA, {
      nombre: 'Solo de A',
      telefono: '573001112233',
      clienteId: clienteA,
    });
    leadA = lead.id;

    await updateLeadSemaforo(tenantA.toString(), asesorA, leadA, 'verde');
  });

  it('el listado del tenantB no devuelve NI CUENTA los leads del tenantA', async () => {
    const listadoB = await listLeads(tenantB.toString(), listQuery);
    expect(listadoB.data).toHaveLength(0);
    // El `total` es tan filtrable como los datos: si contara de más, la paginación delataría
    // la existencia de leads ajenos aunque nunca se devolvieran.
    expect(listadoB.total).toBe(0);

    const listadoA = await listLeads(tenantA.toString(), listQuery);
    expect(listadoA.data.map((l) => l.id)).toEqual([leadA]);
    expect(listadoA.total).toBe(1);
  });

  it('tampoco los devuelve con un filtro que SÍ casaría con ellos', async () => {
    const listadoB = await listLeads(tenantB.toString(), { ...listQuery, estado: 'nuevo' });
    expect(listadoB.data).toHaveLength(0);
    expect(listadoB.total).toBe(0);
  });

  it('`?asesor=` con un userId del tenantA desde el tenantB → página vacía, nunca datos ajenos', async () => {
    const listadoB = await listLeads(tenantB.toString(), { ...listQuery, asesor: asesorA });
    expect(listadoB.data).toHaveLength(0);
    expect(listadoB.total).toBe(0);

    // El mismo filtro en su propia empresa sí encuentra el lead: el vacío de arriba es aislamiento,
    // no un filtro roto.
    const listadoA = await listLeads(tenantA.toString(), { ...listQuery, asesor: asesorA });
    expect(listadoA.data.map((l) => l.id)).toEqual([leadA]);
  });

  it('`?semaforo=` del tenantB no arrastra ni cuenta leads del tenantA', async () => {
    // Ambas empresas tienen la clave `verde` en su catálogo, y el lead clasificado es el de A.
    // Si el filtro se saliera del tenant, el lead de A aparecería aquí.
    const listadoB = await listLeads(tenantB.toString(), { ...listQuery, semaforo: 'verde' });
    expect(listadoB.data).toHaveLength(0);
    expect(listadoB.total).toBe(0);

    // El mismo filtro en su propia empresa sí encuentra el lead: el vacío de arriba es
    // aislamiento, no un filtro roto.
    const listadoA = await listLeads(tenantA.toString(), { ...listQuery, semaforo: 'verde' });
    expect(listadoA.data.map((l) => l.id)).toEqual([leadA]);
    expect(listadoA.data[0]?.semaforo?.key).toBe('verde');
  });

  it('el tenantB no le cambia el semáforo a un lead del tenantA → 404 y NO lo toca', async () => {
    await expect(
      updateLeadSemaforo(tenantB.toString(), asesorB, leadA, 'rojo'),
    ).rejects.toMatchObject({ statusCode: 404 });

    // El 404 no basta: hay que probar que no escribió. Un 403 tampoco valdría — confirmaría
    // que el lead existe en otra empresa.
    const intacto = await findByIdScoped(Lead, tenantA, leadA).lean<ILeadLean>();
    expect(intacto?.semaforo).toBe('verde');
  });

  it('el tenantB no lee el historial de semáforo de un lead del tenantA', async () => {
    await expect(
      listHistorialSemaforo(tenantB.toString(), leadA, 1, 20),
    ).rejects.toMatchObject({ statusCode: 404 });

    // Su dueño sí lo ve, con el cambio que hizo el `beforeEach`.
    const historialA = await listHistorialSemaforo(tenantA.toString(), leadA, 1, 20);
    expect(historialA.total).toBe(1);
    expect(historialA.data[0]).toMatchObject({ de: null, a: 'verde' });
  });

  it('el listado del tenantB no filtra el asesor del tenantA ni por la hidratación en lote', async () => {
    const clienteB = await crearCliente(tenantB, 'wa_list_b');
    await createLeadFromConversation(tenantB.toString(), asesorB, {
      nombre: 'Solo de B',
      telefono: '573007776655',
      clienteId: clienteB,
    });

    const listadoB = await listLeads(tenantB.toString(), listQuery);
    expect(listadoB.data).toHaveLength(1);
    expect(listadoB.data[0]?.responsable?.id).toBe(asesorB);
    expect(listadoB.data.map((l) => l.nombre)).not.toContain('Solo de A');
  });
});
