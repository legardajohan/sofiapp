import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Tag } from '../tag/tag.model.js';
import type { SemaforoSlug } from '../tag/tag.types.js';
import { Semaforo } from '../semaforo/semaforo.model.js';
import { createSemaforo } from '../semaforo/semaforo.service.js';
import { seedSemaforos } from '../../seed/seed-semaforos.js';
import { User } from '../users/user.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { Lead } from './lead.model.js';
import {
  createLeadFromConversation,
  listHistorialSemaforo,
  updateLeadSemaforo,
} from './lead.service.js';
import type { ILeadLean } from './lead.types.js';

const tenant = new Types.ObjectId();
const tenantStr = tenant.toString();

/** El semáforo de la conversación tal y como lo ve la bandeja: los slugs de sus etiquetas. */
async function slugsDeLaConversacion(clienteId: string): Promise<string[]> {
  const cliente = await findByIdScoped(Cliente, tenant, clienteId).lean<{
    tagIds?: Types.ObjectId[];
  }>();
  if (!cliente?.tagIds?.length) return [];

  const tags = await Tag.find({ _id: { $in: cliente.tagIds } })
    .select({ semaforo: 1 })
    .lean<{ semaforo?: SemaforoSlug }[]>();

  return tags.filter((t) => t.semaforo).map((t) => t.semaforo as string);
}

describe('HU-CRM-04 — semáforo del lead', () => {
  let asesor: string;
  let clienteId: string;
  let leadId: string;

  beforeEach(async () => {
    await Lead.deleteMany({});
    await Cliente.deleteMany({});
    await User.deleteMany({});
    await Tag.deleteMany({});
    await Semaforo.deleteMany({});
    await AuditEvent.deleteMany({});
    await Lead.syncIndexes();

    await seedSemaforos(tenant);

    const usuario = await createScoped(User, tenant, {
      nombre: 'Diego',
      email: 'diego@empresa.test',
      passwordHash: 'x',
      rol: 'admin',
      activo: true,
    });
    asesor = String(usuario._id);

    const cliente = await createScoped(Cliente, tenant, {
      metaUserId: 'wa_semaforo',
      telefono: '573001112233',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      tagIds: [],
      ultimoMensajeAt: new Date(),
    });
    clienteId = String(cliente._id);

    const lead = await createLeadFromConversation(tenantStr, asesor, {
      nombre: 'Marta',
      telefono: '573001112233',
      clienteId,
    });
    leadId = lead.id;
  });

  describe('cambio de semáforo', () => {
    it('un lead nace sin clasificar: ponerle color es una decisión, no un default', async () => {
      const lead = await findByIdScoped(Lead, tenant, leadId).lean<ILeadLean>();

      expect(lead?.semaforo).toBeNull();
    });

    it('acepta los cuatro colores del catálogo y los devuelve resueltos', async () => {
      for (const key of ['azul', 'naranja', 'verde', 'rojo']) {
        const lead = await updateLeadSemaforo(tenantStr, asesor, leadId, key);
        expect(lead.semaforo?.key).toBe(key);
      }

      const ultimo = await updateLeadSemaforo(tenantStr, asesor, leadId, 'verde');
      expect(ultimo.semaforo).toMatchObject({ key: 'verde', label: 'Venta concretada' });
    });

    it('acepta un semáforo propio creado por la empresa', async () => {
      const propio = await createSemaforo(tenant, { label: 'Tibio', color: '#CA8A04' });

      const lead = await updateLeadSemaforo(tenantStr, asesor, leadId, propio.key);

      expect(lead.semaforo).toMatchObject({ key: 'tibio', label: 'Tibio', color: '#CA8A04' });
    });

    it('`null` retira la clasificación', async () => {
      await updateLeadSemaforo(tenantStr, asesor, leadId, 'rojo');

      const lead = await updateLeadSemaforo(tenantStr, asesor, leadId, null);

      expect(lead.semaforo).toBeNull();
    });

    it('una clave fuera del catálogo es 400 y NO se graba', async () => {
      await expect(
        updateLeadSemaforo(tenantStr, asesor, leadId, 'inventado'),
      ).rejects.toMatchObject({ statusCode: 400 });

      const lead = await findByIdScoped(Lead, tenant, leadId).lean<ILeadLean>();
      expect(lead?.semaforo).toBeNull();
    });

    it('un lead inexistente es 404', async () => {
      await expect(
        updateLeadSemaforo(tenantStr, asesor, new Types.ObjectId().toString(), 'verde'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('reenviar el semáforo actual es idempotente y NO ensucia el historial', async () => {
      await updateLeadSemaforo(tenantStr, asesor, leadId, 'verde');
      await updateLeadSemaforo(tenantStr, asesor, leadId, 'verde');

      const historial = await listHistorialSemaforo(tenantStr, leadId, 1, 20);

      // Dos llamadas, un solo cambio real: una entrada que no cuenta ningún cambio sería ruido.
      expect(historial.total).toBe(1);
    });
  });

  describe('historial', () => {
    it('registra cada cambio con su antes y su después, más reciente primero', async () => {
      await updateLeadSemaforo(tenantStr, asesor, leadId, 'azul');
      await updateLeadSemaforo(tenantStr, asesor, leadId, 'naranja');
      await updateLeadSemaforo(tenantStr, asesor, leadId, 'verde');

      const historial = await listHistorialSemaforo(tenantStr, leadId, 1, 20);

      expect(historial.total).toBe(3);
      expect(historial.data.map((h) => [h.de, h.a])).toEqual([
        ['naranja', 'verde'],
        ['azul', 'naranja'],
        [null, 'azul'],
      ]);
    });

    it('resuelve el actor a nombre, no a un id suelto', async () => {
      await updateLeadSemaforo(tenantStr, asesor, leadId, 'verde');

      const historial = await listHistorialSemaforo(tenantStr, leadId, 1, 20);

      expect(historial.data[0]?.actor).toEqual({ id: asesor, nombre: 'Diego' });
    });

    it('devuelve SOLO los cambios de semáforo, no el resto de la bitácora del lead', async () => {
      // El lead ya tiene un `lead.create` de su conversión. Si el filtro por acción no fuera a la
      // consulta, se colaría aquí y el `total` no cuadraría con las filas.
      await updateLeadSemaforo(tenantStr, asesor, leadId, 'verde');

      const historial = await listHistorialSemaforo(tenantStr, leadId, 1, 20);

      expect(historial.total).toBe(1);
      expect(historial.data[0]?.a).toBe('verde');
    });

    it('pagina con un `total` que corresponde con las filas', async () => {
      await updateLeadSemaforo(tenantStr, asesor, leadId, 'azul');
      await updateLeadSemaforo(tenantStr, asesor, leadId, 'naranja');
      await updateLeadSemaforo(tenantStr, asesor, leadId, 'verde');

      const p1 = await listHistorialSemaforo(tenantStr, leadId, 1, 2);
      const p2 = await listHistorialSemaforo(tenantStr, leadId, 2, 2);

      expect(p1.data).toHaveLength(2);
      expect(p2.data).toHaveLength(1);
      expect(p1.total).toBe(3);
      expect(new Set([...p1.data, ...p2.data].map((h) => h.id)).size).toBe(3);
    });

    it('un lead sin cambios devuelve historial vacío, no un error', async () => {
      const historial = await listHistorialSemaforo(tenantStr, leadId, 1, 20);

      expect(historial).toMatchObject({ data: [], total: 0, page: 1, limit: 20 });
    });
  });

  describe('sincronización con la bandeja', () => {
    async function sembrarTag(semaforo: SemaforoSlug): Promise<Types.ObjectId> {
      const doc = await createScoped(Tag, tenant, {
        nombre: semaforo,
        color: '#16A34A',
        semaforo,
      });
      return doc._id as Types.ObjectId;
    }

    it('deja la conversación con UNA sola etiqueta de semáforo', async () => {
      await sembrarTag('verde');
      await sembrarTag('rojo');

      await updateLeadSemaforo(tenantStr, asesor, leadId, 'rojo');
      expect(await slugsDeLaConversacion(clienteId)).toEqual(['rojo']);

      // Al cambiar, la anterior se retira: dos colores a la vez en la bandeja no significan nada.
      await updateLeadSemaforo(tenantStr, asesor, leadId, 'verde');
      expect(await slugsDeLaConversacion(clienteId)).toEqual(['verde']);
    });

    it('no toca las etiquetas libres del tenant', async () => {
      const verde = await sembrarTag('verde');
      const libre = await createScoped(Tag, tenant, { nombre: 'VIP', color: '#7C3AED' });
      await Cliente.updateOne(
        { _id: clienteId },
        { $set: { tagIds: [libre._id as Types.ObjectId, verde] } },
      );

      await updateLeadSemaforo(tenantStr, asesor, leadId, 'rojo');

      const cliente = await findByIdScoped(Cliente, tenant, clienteId).lean<{
        tagIds: Types.ObjectId[];
      }>();
      expect(cliente?.tagIds.map(String)).toContain(String(libre._id));
    });

    it('retirar el semáforo del lead deja la conversación sin chip', async () => {
      await sembrarTag('verde');
      await updateLeadSemaforo(tenantStr, asesor, leadId, 'verde');

      await updateLeadSemaforo(tenantStr, asesor, leadId, null);

      expect(await slugsDeLaConversacion(clienteId)).toEqual([]);
    });

    it('un semáforo propio no tiene etiqueta equivalente: la bandeja se queda sin chip, sin fallar', async () => {
      await sembrarTag('verde');
      await updateLeadSemaforo(tenantStr, asesor, leadId, 'verde');

      const propio = await createSemaforo(tenant, { label: 'Tibio' });
      const lead = await updateLeadSemaforo(tenantStr, asesor, leadId, propio.key);

      // El dato autoritativo se guardó igual; el reflejo en la bandeja simplemente no aplica.
      expect(lead.semaforo?.key).toBe('tibio');
      expect(await slugsDeLaConversacion(clienteId)).toEqual([]);
    });

    it('si el administrador borró la etiqueta, el semáforo del lead se guarda igual', async () => {
      // Ninguna etiqueta sembrada: `docs/domain.md` §5 permite borrarlas. Esto NO es un error.
      const lead = await updateLeadSemaforo(tenantStr, asesor, leadId, 'verde');

      expect(lead.semaforo?.key).toBe('verde');
      expect(await slugsDeLaConversacion(clienteId)).toEqual([]);
    });
  });
});
