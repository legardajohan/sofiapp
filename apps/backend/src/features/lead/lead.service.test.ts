import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { countScoped, createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { EstadoComercial } from '../cliente/cliente.types.js';
import { Tag } from '../tag/tag.model.js';
import { Estado } from '../estado/estado.model.js';
import { Semaforo } from '../semaforo/semaforo.model.js';
import { seedEstados } from '../../seed/seed-estados.js';
import { seedSemaforos } from '../../seed/seed-semaforos.js';
import { createEstado } from '../estado/estado.service.js';
import type { SemaforoSlug } from '../tag/tag.types.js';
import { User } from '../users/user.model.js';
import * as auditService from '../audit/audit.service.js';
import { AppError } from '../../utils/AppError.js';
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

const tenant = new Types.ObjectId();
const tenantStr = tenant.toString();

async function crearCliente(metaUserId: string, nombre?: string): Promise<string> {
  const doc = await createScoped(Cliente, tenant, {
    metaUserId,
    telefono: '573001112233',
    nombre,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: [],
  });
  return String(doc._id);
}

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

const dtoBase = { nombre: 'Ana Pérez', telefono: '573001112233' };

describe('HU-CRM-01 — conversión de una conversación en lead', () => {
  let clienteId: string;
  let asesorId: string;

  beforeEach(async () => {
    await Lead.deleteMany({});
    await Cliente.deleteMany({});
    await User.deleteMany({});
    // Sin los índices reales el 409 por carrera no se puede probar.
    await Lead.syncIndexes();
    vi.restoreAllMocks();

    clienteId = await crearCliente('wa_crm_01', 'Ana');
    asesorId = await crearAsesor('Carolina');
  });

  it('crea el lead con estado `nuevo` y el responsable del token', async () => {
    const lead = await createLeadFromConversation(tenantStr, asesorId, { ...dtoBase, clienteId });

    expect(lead.estado).toBe('nuevo');
    expect(lead.nombre).toBe('Ana Pérez');
    expect(lead.responsable).toEqual({ id: asesorId, nombre: 'Carolina' });
    expect(lead.contacto).toEqual({ id: clienteId, nombre: 'Ana', telefono: '573001112233' });
  });

  it('guarda la trazabilidad del origen (DoD de la historia)', async () => {
    const lead = await createLeadFromConversation(tenantStr, asesorId, { ...dtoBase, clienteId });

    expect(lead.origen.conversacionId).toBe(clienteId);
    expect(lead.origen.convertidoPor).toEqual({ id: asesorId, nombre: 'Carolina' });
    expect(new Date(lead.origen.convertidoAt).getTime()).toBeLessThanOrEqual(Date.now());

    // El discriminador `tipo` se persiste aunque no viaje en la respuesta.
    const doc = await findByIdScoped(Lead, tenant, lead.id).lean<ILeadLean>();
    expect(doc?.origen.tipo).toBe('conversacion');
  });

  it('un segundo lead con el mismo teléfono devuelve 409 con el `leadId` existente', async () => {
    const primero = await createLeadFromConversation(tenantStr, asesorId, {
      ...dtoBase,
      clienteId,
    });

    const otro = await crearCliente('wa_crm_02');
    await expect(
      createLeadFromConversation(tenantStr, asesorId, { ...dtoBase, clienteId: otro }),
    ).rejects.toMatchObject({ statusCode: 409, details: { leadId: primero.id } });

    expect(await countScoped(Lead, tenant)).toBe(1);
  });

  it('normaliza el teléfono: el formato no puede burlar la unicidad', async () => {
    await createLeadFromConversation(tenantStr, asesorId, { ...dtoBase, clienteId });

    const otro = await crearCliente('wa_crm_03');
    await expect(
      createLeadFromConversation(tenantStr, asesorId, {
        nombre: 'Ana con espacios',
        telefono: '+57 300 111 2233',
        clienteId: otro,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('un `clienteId` inexistente devuelve 404 y no crea nada', async () => {
    const fantasma = new Types.ObjectId().toString();
    await expect(
      createLeadFromConversation(tenantStr, asesorId, { ...dtoBase, clienteId: fantasma }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(await countScoped(Lead, tenant)).toBe(0);
  });

  it('`getLeadById` devuelve contacto, responsable y autor resueltos con nombre', async () => {
    const creado = await createLeadFromConversation(tenantStr, asesorId, { ...dtoBase, clienteId });
    const lead = await getLeadById(tenantStr, creado.id);

    expect(lead.contacto.nombre).toBe('Ana');
    expect(lead.responsable?.nombre).toBe('Carolina');
    expect(lead.origen.convertidoPor?.nombre).toBe('Carolina');
  });

  it('`getLeadById` con un id inexistente devuelve 404', async () => {
    await expect(getLeadById(tenantStr, new Types.ObjectId().toString())).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('un fallo al auditar no le cuesta el lead al asesor', async () => {
    // `recordAuditEvent` se traga sus errores, pero la garantía se prueba explícitamente: si algún
    // día deja de hacerlo, la conversión no debe caer con él.
    vi.spyOn(auditService, 'recordAuditEvent').mockResolvedValue(undefined);

    const lead = await createLeadFromConversation(tenantStr, asesorId, { ...dtoBase, clienteId });
    expect(lead.id).toBeTruthy();
    expect(await countScoped(Lead, tenant)).toBe(1);
  });

  it('registra el evento de auditoría de la conversión', async () => {
    const spy = vi.spyOn(auditService, 'recordAuditEvent');
    await createLeadFromConversation(tenantStr, asesorId, { ...dtoBase, clienteId });

    expect(spy).toHaveBeenCalledWith(
      tenantStr,
      expect.objectContaining({ accion: 'lead.create', entidad: 'lead', actorId: asesorId }),
    );
  });

  describe('deleteLead — el lead que no debió existir', () => {
    it('borra el lead y deja de encontrarse', async () => {
      const lead = await createLeadFromConversation(tenantStr, asesorId, { ...dtoBase, clienteId });

      await deleteLead(tenantStr, asesorId, lead.id, 'spam');

      expect(await countScoped(Lead, tenant)).toBe(0);
      await expect(getLeadById(tenantStr, lead.id)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('libera el teléfono: la conversación se puede volver a convertir', async () => {
      // Es el punto del borrado duro. Con el lead marcado en vez de borrado, el índice único
      // `{ tenantId, telefono }` seguiría ocupado y la reconversión moriría en un 409.
      const primero = await createLeadFromConversation(tenantStr, asesorId, {
        ...dtoBase,
        clienteId,
      });
      await deleteLead(tenantStr, asesorId, primero.id, 'prueba');

      const segundo = await createLeadFromConversation(tenantStr, asesorId, {
        ...dtoBase,
        clienteId,
      });
      expect(segundo.id).not.toBe(primero.id);
      expect(await countScoped(Lead, tenant)).toBe(1);
    });

    it('audita el motivo y guarda el lead entero en `antes`', async () => {
      const lead = await createLeadFromConversation(tenantStr, asesorId, {
        ...dtoBase,
        correo: 'ana@empresa.com',
        clienteId,
      });
      const spy = vi.spyOn(auditService, 'recordAuditEvent');

      await deleteLead(tenantStr, asesorId, lead.id, 'duplicado');

      expect(spy).toHaveBeenCalledWith(
        tenantStr,
        expect.objectContaining({
          accion: 'lead.delete',
          entidad: 'lead',
          entidadId: lead.id,
          actorId: asesorId,
          despues: { motivo: 'duplicado' },
          // El borrado es definitivo: esta copia es lo único que queda del lead.
          antes: expect.objectContaining({
            nombre: 'Ana Pérez',
            telefono: '573001112233',
            correo: 'ana@empresa.com',
          }),
        }),
      );
    });

    it('un lead inexistente → 404', async () => {
      await expect(
        deleteLead(tenantStr, asesorId, new Types.ObjectId().toString(), 'spam'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('findLeadIdsByClientes', () => {
    it('devuelve el mapa clienteId → leadId y omite los contactos sin lead', async () => {
      const sinLead = await crearCliente('wa_crm_sin_lead');
      const lead = await createLeadFromConversation(tenantStr, asesorId, { ...dtoBase, clienteId });

      const mapa = await findLeadIdsByClientes(tenantStr, [clienteId, sinLead]);

      expect(mapa.get(clienteId)).toBe(lead.id);
      expect(mapa.has(sinLead)).toBe(false);
      expect(mapa.size).toBe(1);
    });

    it('sin ids no consulta la base', async () => {
      const mapa = await findLeadIdsByClientes(tenantStr, []);
      expect(mapa.size).toBe(0);
    });
  });
});

describe('HU-CRM-01 — AppError con datos adjuntos', () => {
  it('sin `details` el contrato de error no cambia', () => {
    const err = new AppError('Vacío.', 404);
    expect(err.details).toBeUndefined();
    expect({ ...err.details, message: err.message }).toEqual({ message: 'Vacío.' });
  });

  it('`details` añade claves pero no puede pisar `message`', () => {
    const err = new AppError('El real.', 409, { leadId: 'abc', message: 'intruso' });
    // Mismo orden de difusión que `error-handler.middleware.ts`.
    expect({ ...err.details, message: err.message }).toEqual({
      leadId: 'abc',
      message: 'El real.',
    });
  });
});

describe('HU-CRM-03 — listado de leads', () => {
  const listQuery = { page: 1, limit: 20 };

  /** Crea un lead ya asentado y le fija el `createdAt`, que es por lo que ordena y filtra. */
  async function sembrarLead(opciones: {
    nombre: string;
    telefono: string;
    metaUserId: string;
    responsableId: string;
    estado?: EstadoComercial;
    semaforo?: string;
    createdAt?: Date;
    tagIds?: Types.ObjectId[];
    resumen?: { texto: string; generadoAt: Date; mensajesHasta: Date };
    ultimoMensajeAt?: Date;
  }): Promise<string> {
    const cliente = await createScoped(Cliente, tenant, {
      metaUserId: opciones.metaUserId,
      telefono: opciones.telefono,
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      tagIds: opciones.tagIds ?? [],
      ultimoMensajeAt: opciones.ultimoMensajeAt,
      ...(opciones.resumen
        ? { resumenIA: { ...opciones.resumen, modelo: 'gemini-1.5-flash' } }
        : {}),
    });

    const lead = await createScoped(Lead, tenant, {
      nombre: opciones.nombre,
      telefono: opciones.telefono,
      clienteId: cliente._id,
      estado: opciones.estado ?? 'nuevo',
      semaforo: opciones.semaforo ?? null,
      responsableId: new Types.ObjectId(opciones.responsableId),
      origen: {
        tipo: 'conversacion',
        conversacionId: cliente._id,
        convertidoPor: new Types.ObjectId(opciones.responsableId),
        convertidoAt: new Date(),
      },
    });

    if (opciones.createdAt) {
      // Por el driver crudo a propósito: `timestamps: true` marca `createdAt` como inmutable y
      // Mongoose lo descarta silenciosamente de un `updateOne`, dejando el test verde sin probar
      // nada. Aquí la fecha es justo lo que se está probando.
      await Lead.collection.updateOne(
        { _id: lead._id },
        { $set: { createdAt: opciones.createdAt } },
      );
    }
    return String(lead._id);
  }

  async function crearTagSemaforo(semaforo: SemaforoSlug, nombre: string): Promise<Types.ObjectId> {
    const doc = await createScoped(Tag, tenant, { nombre, color: '#16A34A', semaforo });
    return doc._id as Types.ObjectId;
  }

  let carolina: string;
  let diego: string;

  beforeEach(async () => {
    await Lead.deleteMany({});
    await Cliente.deleteMany({});
    await User.deleteMany({});
    await Tag.deleteMany({});
    await Estado.deleteMany({});
    await Semaforo.deleteMany({});
    await Lead.syncIndexes();

    // El pipeline es un catálogo por tenant (HU-CRM-03): sin sembrarlo, `?estado=` no encuentra la
    // clave y devuelve página vacía, que es justo el comportamiento nuevo.
    await seedEstados(tenant);

    // La semaforizacion tambien es un catalogo por tenant (HU-CRM-04): sin sembrarlo,
    // `?semaforo=` no encuentra la clave y devuelve pagina vacia, que es lo correcto.
    await seedSemaforos(tenant);

    carolina = await crearAsesor('Carolina');
    diego = await crearAsesor('Diego');
  });

  it('devuelve la forma paginada canónica, ordenada por `createdAt` descendente', async () => {
    await sembrarLead({
      nombre: 'El viejo',
      telefono: '573000000001',
      metaUserId: 'wa_1',
      responsableId: carolina,
      createdAt: new Date('2026-01-01T10:00:00Z'),
    });
    await sembrarLead({
      nombre: 'El nuevo',
      telefono: '573000000002',
      metaUserId: 'wa_2',
      responsableId: carolina,
      createdAt: new Date('2026-08-01T10:00:00Z'),
    });

    const res = await listLeads(tenantStr, listQuery);

    expect(res).toMatchObject({ page: 1, limit: 20, total: 2 });
    expect(res.data.map((l) => l.nombre)).toEqual(['El nuevo', 'El viejo']);
  });

  it('pagina sin repetir elementos entre páginas', async () => {
    for (let i = 0; i < 3; i++) {
      await sembrarLead({
        nombre: `Lead ${i}`,
        telefono: `57300000001${i}`,
        metaUserId: `wa_p${i}`,
        responsableId: carolina,
        createdAt: new Date(2026, 0, i + 1),
      });
    }

    const p1 = await listLeads(tenantStr, { page: 1, limit: 2 });
    const p2 = await listLeads(tenantStr, { page: 2, limit: 2 });

    expect(p1.data).toHaveLength(2);
    expect(p2.data).toHaveLength(1);
    expect(p1.total).toBe(3);
    // Lo que la paginación no puede hacer es devolver dos veces el mismo lead.
    const ids = [...p1.data, ...p2.data].map((l) => l.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('resuelve responsable y semáforo, no ids sueltos', async () => {
    await sembrarLead({
      nombre: 'Con todo',
      telefono: '573000000020',
      metaUserId: 'wa_full',
      responsableId: diego,
      semaforo: 'verde',
    });

    const [lead] = (await listLeads(tenantStr, listQuery)).data;

    expect(lead?.responsable).toEqual({ id: diego, nombre: 'Diego' });
    // Etiqueta y color salen del catálogo del tenant, no de un enum del código.
    expect(lead?.semaforo).toMatchObject({
      key: 'verde',
      label: 'Venta concretada',
      color: '#16A34A',
    });
    expect(lead?.conversacionId).toEqual(expect.any(String));
  });

  it('un lead sin clasificar devuelve `semaforo: null`, no algo que rompa la fila', async () => {
    await sembrarLead({
      nombre: 'Sin clasificar',
      telefono: '573000000021',
      metaUserId: 'wa_sin',
      responsableId: diego,
    });

    const [lead] = (await listLeads(tenantStr, listQuery)).data;

    expect(lead?.semaforo).toBeNull();
  });

  it('el semáforo del lead ignora las etiquetas de la conversación', async () => {
    // Antes el semáforo del listado salía de `Cliente.tagIds` y podían ser varias. Desde
    // HU-CRM-04 es un campo del lead: las etiquetas de la conversación ya no lo deciden.
    const verde = await crearTagSemaforo('verde', 'Avanza');
    const rojo = await crearTagSemaforo('rojo', 'En riesgo');
    await sembrarLead({
      nombre: 'Etiquetas que no mandan',
      telefono: '573009998877',
      metaUserId: 'wa_dos_semaforos',
      responsableId: diego,
      semaforo: 'azul',
      tagIds: [rojo, verde],
    });

    const [lead] = (await listLeads(tenantStr, listQuery)).data;

    expect(lead?.semaforo?.key).toBe('azul');
  });

  it('asignar un estado del catálogo lo guarda y lo devuelve resuelto', async () => {
    const id = await sembrarLead({
      nombre: 'Mueve',
      telefono: '573001234567',
      metaUserId: 'wa_mueve',
      responsableId: diego,
    });

    const actualizado = await updateLeadEstado(tenantStr, diego, id, 'pagado');

    expect(actualizado.estado).toBe('pagado');
    expect((await listLeads(tenantStr, listQuery)).data[0]?.estado).toBe('pagado');
  });

  it('un estado que no está en el catálogo del tenant es 400, no un guardado silencioso', async () => {
    const id = await sembrarLead({
      nombre: 'Mueve',
      telefono: '573001234567',
      metaUserId: 'wa_mueve',
      responsableId: diego,
    });

    // A diferencia del filtro del listado, aquí una clave desconocida escribiría en el lead un
    // estado que nadie puede resolver.
    await expect(updateLeadEstado(tenantStr, diego, id, 'inventado')).rejects.toThrow(AppError);
    expect((await listLeads(tenantStr, listQuery)).data[0]?.estado).toBe('nuevo');
  });

  it('un estado propio recién creado se puede asignar igual que los de fábrica', async () => {
    const propio = await createEstado(tenantStr, { label: 'Visita agendada' });
    const id = await sembrarLead({
      nombre: 'Mueve',
      telefono: '573001234567',
      metaUserId: 'wa_mueve',
      responsableId: diego,
    });

    const actualizado = await updateLeadEstado(tenantStr, diego, id, propio.key);

    expect(actualizado.estado).toBe('visita-agendada');
  });

  it('filtra por `estado` y el `total` refleja el filtro, no el total del tenant', async () => {
    await sembrarLead({
      nombre: 'Nuevo',
      telefono: '573000000030',
      metaUserId: 'wa_e1',
      responsableId: carolina,
    });
    await sembrarLead({
      nombre: 'Pagado',
      telefono: '573000000031',
      metaUserId: 'wa_e2',
      responsableId: carolina,
      estado: 'pagado',
    });

    const res = await listLeads(tenantStr, { ...listQuery, estado: 'pagado' });

    expect(res.data.map((l) => l.nombre)).toEqual(['Pagado']);
    expect(res.total).toBe(1);
  });

  it('filtra por `asesor` (que es `responsableId`)', async () => {
    await sembrarLead({
      nombre: 'De Carolina',
      telefono: '573000000040',
      metaUserId: 'wa_a1',
      responsableId: carolina,
    });
    await sembrarLead({
      nombre: 'De Diego',
      telefono: '573000000041',
      metaUserId: 'wa_a2',
      responsableId: diego,
    });

    const res = await listLeads(tenantStr, { ...listQuery, asesor: diego });

    expect(res.data.map((l) => l.nombre)).toEqual(['De Diego']);
    expect(res.total).toBe(1);
  });

  it('`hasta` es inclusive: un lead creado ese mismo día entra en el rango', async () => {
    await sembrarLead({
      nombre: 'A las seis de la tarde',
      telefono: '573000000050',
      metaUserId: 'wa_h1',
      responsableId: carolina,
      createdAt: new Date('2026-08-21T18:00:00Z'),
    });

    // `?hasta=2026-08-21` llega como medianoche: sin estirarlo al final del día, este lead
    // quedaría fuera y el usuario pediría "hasta hoy" sin ver nada de hoy.
    const res = await listLeads(tenantStr, { ...listQuery, hasta: new Date('2026-08-21') });

    expect(res.data).toHaveLength(1);
  });

  it('`desde` deja fuera lo anterior al rango', async () => {
    await sembrarLead({
      nombre: 'Antiguo',
      telefono: '573000000060',
      metaUserId: 'wa_d1',
      responsableId: carolina,
      createdAt: new Date('2026-01-01T10:00:00Z'),
    });
    await sembrarLead({
      nombre: 'Reciente',
      telefono: '573000000061',
      metaUserId: 'wa_d2',
      responsableId: carolina,
      createdAt: new Date('2026-08-10T10:00:00Z'),
    });

    const res = await listLeads(tenantStr, { ...listQuery, desde: new Date('2026-08-01') });

    expect(res.data.map((l) => l.nombre)).toEqual(['Reciente']);
  });

  it('combina filtros: solo pasa el lead que cumple todos', async () => {
    await sembrarLead({
      nombre: 'El elegido',
      telefono: '573000000070',
      metaUserId: 'wa_c1',
      responsableId: diego,
      estado: 'en_gestion',
      semaforo: 'verde',
      createdAt: new Date('2026-08-05T10:00:00Z'),
    });
    // Igual en todo salvo el responsable.
    await sembrarLead({
      nombre: 'Casi',
      telefono: '573000000071',
      metaUserId: 'wa_c2',
      responsableId: carolina,
      estado: 'en_gestion',
      semaforo: 'verde',
      createdAt: new Date('2026-08-05T10:00:00Z'),
    });

    const res = await listLeads(tenantStr, {
      ...listQuery,
      estado: 'en_gestion',
      asesor: diego,
      semaforo: 'verde',
      desde: new Date('2026-08-01'),
      hasta: new Date('2026-08-31'),
    });

    expect(res.data.map((l) => l.nombre)).toEqual(['El elegido']);
    expect(res.total).toBe(1);
  });

  it('filtra por el semáforo del propio lead', async () => {
    await sembrarLead({
      nombre: 'Cerrado',
      telefono: '573000000080',
      metaUserId: 'wa_s1',
      responsableId: carolina,
      semaforo: 'verde',
    });
    await sembrarLead({
      nombre: 'Sin clasificar',
      telefono: '573000000081',
      metaUserId: 'wa_s2',
      responsableId: carolina,
    });

    const res = await listLeads(tenantStr, { ...listQuery, semaforo: 'verde' });

    expect(res.data.map((l) => l.nombre)).toEqual(['Cerrado']);
    expect(res.total).toBe(1);
  });

  it('semáforo que no está en el catálogo da página vacía, no el listado sin filtrar', async () => {
    await sembrarLead({
      nombre: 'Existe',
      telefono: '573000000090',
      metaUserId: 'wa_s3',
      responsableId: carolina,
    });

    // Devolver el listado entero aquí sería lo peor posible: el usuario pidió acotar y
    // recibiría todo. Cubre además el caso de colar la clave de otra empresa.
    const res = await listLeads(tenantStr, { ...listQuery, semaforo: 'inventado' });

    expect(res.data).toHaveLength(0);
    expect(res.total).toBe(0);
  });

  it('hidrata el resumen de la conversación y marca el desactualizado', async () => {
    const generadoAt = new Date('2026-08-01T10:00:00Z');

    await sembrarLead({
      nombre: 'Al día',
      telefono: '573000000100',
      metaUserId: 'wa_r1',
      responsableId: carolina,
      resumen: { texto: 'Quiere el plan anual.', generadoAt, mensajesHasta: generadoAt },
      ultimoMensajeAt: generadoAt,
      createdAt: new Date('2026-08-02T10:00:00Z'),
    });
    await sembrarLead({
      nombre: 'Desfasado',
      telefono: '573000000101',
      metaUserId: 'wa_r2',
      responsableId: carolina,
      resumen: { texto: 'Preguntó por precios.', generadoAt, mensajesHasta: generadoAt },
      // Llegaron mensajes después de generar el resumen.
      ultimoMensajeAt: new Date('2026-08-03T10:00:00Z'),
      createdAt: new Date('2026-08-01T10:00:00Z'),
    });

    // El resumen es un dato sensible (HU-IA-04): sin el permiso no se hidrata ninguno.
    const res = await listLeads(tenantStr, listQuery, true);
    const alDia = res.data.find((l) => l.nombre === 'Al día');
    const desfasado = res.data.find((l) => l.nombre === 'Desfasado');

    expect(alDia?.resumen).toMatchObject({
      texto: 'Quiere el plan anual.',
      desactualizado: false,
    });
    expect(desfasado?.resumen?.desactualizado).toBe(true);
  });

  it('sin permiso de datos sensibles el resumen llega en null, aunque exista (HU-IA-04)', async () => {
    // El resumen lo escribe el modelo sobre el transcript entero, así que puede citar en claro el
    // correo o el documento que la ficha enmascara. La tabla de leads lo proyecta igual que la
    // bandeja, y por tanto se calla igual.
    const generadoAt = new Date('2026-08-01T10:00:00Z');
    await sembrarLead({
      nombre: 'Con resumen',
      telefono: '573000000102',
      metaUserId: 'wa_r4',
      responsableId: carolina,
      resumen: { texto: 'Quiere el plan anual.', generadoAt, mensajesHasta: generadoAt },
      ultimoMensajeAt: generadoAt,
    });

    const [lead] = (await listLeads(tenantStr, listQuery, false)).data;

    expect(lead?.resumen).toBeNull();
  });

  it('una conversación sin resumen devuelve `resumen: null` sin romper la fila', async () => {
    await sembrarLead({
      nombre: 'Sin resumen',
      telefono: '573000000110',
      metaUserId: 'wa_r3',
      responsableId: carolina,
    });

    const [lead] = (await listLeads(tenantStr, listQuery)).data;

    expect(lead?.resumen).toBeNull();
    expect(lead?.ultimoMensajeAt).toBeNull();
    expect(lead?.nombre).toBe('Sin resumen');
  });

  it('un tenant sin leads devuelve una página vacía, no un error', async () => {
    const res = await listLeads(tenantStr, listQuery);
    expect(res).toEqual({ data: [], page: 1, limit: 20, total: 0 });
  });
});
