import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { countScoped, createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { User } from '../users/user.model.js';
import { listConversations } from '../conversation/conversation.service.js';
import { Lead } from './lead.model.js';
import {
  createLeadFromConversation,
  deleteLead,
  findLeadIdsByClientes,
  getLeadById,
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
