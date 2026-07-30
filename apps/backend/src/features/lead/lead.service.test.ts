import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { countScoped, createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { User } from '../users/user.model.js';
import * as auditService from '../audit/audit.service.js';
import { AppError } from '../../utils/AppError.js';
import { Lead } from './lead.model.js';
import {
  createLeadFromConversation,
  deleteLead,
  findLeadIdsByClientes,
  getLeadById,
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
    const primero = await createLeadFromConversation(tenantStr, asesorId, { ...dtoBase, clienteId });

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
    await expect(
      getLeadById(tenantStr, new Types.ObjectId().toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
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
