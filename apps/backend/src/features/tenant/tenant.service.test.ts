import { describe, it, expect, vi } from 'vitest';

// Mock de la cola BullMQ: tenant.service → kb.service → config/queues.js construye la Queue al
// cargar; sin mock intentaría conectar a Redis. El seeding no encola, pero evitamos el ruido.
vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  AI_REPLY_QUEUE_NAME: 'ai-reply',
  AI_REPLY_JOB_NAME: 'auto-reply',
  inboundQueue: { add: vi.fn() },
  aiReplyQueue: { add: vi.fn().mockResolvedValue(undefined) },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import { Tenant } from './tenant.model.js';
import { UserModel } from '../users/user.model.js';
import { KbDocument } from '../kb/kb-document.model.js';
import * as kbService from '../kb/kb.service.js';
import { Plan } from '../plan/plan.model.js';
import { createTenant, updateTenant, updateTenantStatus } from './tenant.service.js';
import { AppError } from '../../utils/AppError.js';
import type { IKbDocument } from '../kb/kb.types.js';

describe('tenant.service — HU-SAAS-01', () => {
  describe('createTenant', () => {
    it('crea empresa sin adminUser', async () => {
      const result = await createTenant({
        nombre: 'Empresa Test',
        slug: 'empresa-test',
        contacto: { email: 'test@empresa.com', telefono: '3001234567' },
      });

      expect(result._id).toBeDefined();
      expect(result.nombre).toBe('Empresa Test');
      expect(result.estado).toBe('prueba');

      const users = await UserModel.find({});
      expect(users).toHaveLength(0);
    });

    it('crea empresa con adminUser — ambos persisten', async () => {
      const result = await createTenant({
        nombre: 'Empresa Con Admin',
        slug: 'empresa-con-admin',
        contacto: { email: 'admin@empresa.com', telefono: '3001234568' },
        adminUser: {
          nombre: 'Juan Admin',
          email: 'juan@empresa.com',
          password: 'password123',
        },
      });

      expect(result._id).toBeDefined();

      const user = await UserModel.findOne({ email: 'juan@empresa.com' }).lean();
      expect(user).not.toBeNull();
      expect(user!.rol).toBe('admin');
      expect(user!.tenantId?.toString()).toBe(result._id);
      expect(user!.activo).toBe(true);
    });

    it('rollback atómico si adminUser tiene email duplicado', async () => {
      // Pre-crear un usuario con ese email
      await UserModel.create({
        tenantId: null,
        nombre: 'Existente',
        email: 'duplicado@empresa.com',
        passwordHash: 'hash',
        rol: 'admin',
        activo: true,
      });

      await expect(
        createTenant({
          nombre: 'Empresa Rollback',
          slug: 'empresa-rollback',
          contacto: { email: 'rr@empresa.com', telefono: '3001234569' },
          adminUser: {
            nombre: 'Admin Dup',
            email: 'duplicado@empresa.com',
            password: 'password123',
          },
        })
      ).rejects.toThrow();

      // El tenant NO debe haberse persistido
      const tenant = await Tenant.findOne({ slug: 'empresa-rollback' }).lean();
      expect(tenant).toBeNull();
    });

    it('siembra los 5 documentos predefinidos en la KB del tenant', async () => {
      const result = await createTenant({
        nombre: 'Empresa Seed',
        slug: 'empresa-seed',
        contacto: { email: 'seed@empresa.com', telefono: '3001234580' },
      });

      const docs = await KbDocument.find({ tenantId: result._id }).lean<IKbDocument[]>();
      expect(docs).toHaveLength(5);
      expect(docs.every((d) => d.isPreset === true)).toBe(true);
      expect(docs.every((d) => d.contenido === '')).toBe(true);
      expect(docs.every((d) => d.estadoIndexacion === 'pendiente')).toBe(true);
    });

    it('si el seeding de la KB falla, la creación del tenant NO se revierte', async () => {
      const spy = vi
        .spyOn(kbService, 'seedPresetDocuments')
        .mockRejectedValueOnce(new Error('fallo simulado de seeding'));

      const result = await createTenant({
        nombre: 'Empresa Seed Falla',
        slug: 'empresa-seed-falla',
        contacto: { email: 'seedfail@empresa.com', telefono: '3001234581' },
      });

      expect(result._id).toBeDefined();
      const tenant = await Tenant.findById(result._id).lean();
      expect(tenant).not.toBeNull();

      spy.mockRestore();
    });

    it('lanza AppError 429 si el plan asignado ya no admite más usuarios (HU-SAAS-02)', async () => {
      // Regresión: assertWithinQuota se llama DENTRO de la misma transacción que crea el tenant,
      // por lo que debe ver el documento aún no confirmado (requiere pasar la `session`).
      const plan = await Plan.create({
        nombre: 'CeroUsuarios',
        limites: { usuarios: 0, administradores: 1, mensajesMes: 10, leads: 10, campanasMes: 1 },
        precio: 0,
        activo: true,
      });

      await expect(
        createTenant({
          nombre: 'Empresa Sin Cupo',
          slug: 'empresa-sin-cupo',
          contacto: { email: 'cupo@empresa.com', telefono: '3001234580' },
          planId: plan._id.toString(),
          adminUser: { nombre: 'Admin Cupo', email: 'admincupo@empresa.com', password: 'password123' },
        })
      ).rejects.toMatchObject({ statusCode: 429 });

      // Rollback atómico: ni el tenant ni el usuario deben haberse persistido.
      const tenant = await Tenant.findOne({ slug: 'empresa-sin-cupo' }).lean();
      expect(tenant).toBeNull();
      const user = await UserModel.findOne({ email: 'admincupo@empresa.com' }).lean();
      expect(user).toBeNull();
    });

    it('lanza AppError 409 si slug ya existe', async () => {
      await createTenant({
        nombre: 'Empresa Slug',
        slug: 'slug-duplicado',
        contacto: { email: 'slug@empresa.com', telefono: '3001234570' },
      });

      await expect(
        createTenant({
          nombre: 'Empresa Slug 2',
          slug: 'slug-duplicado',
          contacto: { email: 'slug2@empresa.com', telefono: '3001234571' },
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('updateTenant', () => {
    it('lanza AppError 404 si el id no existe', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      await expect(updateTenant(fakeId, { nombre: 'Nuevo' })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('actualiza campos editables correctamente', async () => {
      const created = await createTenant({
        nombre: 'Empresa Original',
        slug: 'empresa-original',
        contacto: { email: 'orig@empresa.com', telefono: '3001234572' },
      });

      const updated = await updateTenant(created._id, { nombre: 'Empresa Actualizada' });
      expect(updated.nombre).toBe('Empresa Actualizada');
    });
  });

  describe('updateTenantStatus', () => {
    it('lanza AppError 409 si ya tiene el estado solicitado', async () => {
      const created = await createTenant({
        nombre: 'Empresa Status',
        slug: 'empresa-status',
        contacto: { email: 'status@empresa.com', telefono: '3001234573' },
      });

      // estado inicial es 'prueba' — intentar cambiar a 'prueba' lanza 409
      // (creamos en estado prueba, cambiamos a activo primero)
      await updateTenantStatus(created._id, { estado: 'activo' });

      await expect(
        updateTenantStatus(created._id, { estado: 'activo' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('cambia estado de prueba → activo → suspendido', async () => {
      const created = await createTenant({
        nombre: 'Empresa Toggle',
        slug: 'empresa-toggle',
        contacto: { email: 'toggle@empresa.com', telefono: '3001234574' },
      });

      const activo = await updateTenantStatus(created._id, { estado: 'activo' });
      expect(activo.estado).toBe('activo');

      const suspendido = await updateTenantStatus(created._id, { estado: 'suspendido' });
      expect(suspendido.estado).toBe('suspendido');
    });
  });
});
