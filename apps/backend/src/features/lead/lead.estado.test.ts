import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { User } from '../users/user.model.js';
import { Estado } from '../estado/estado.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { seedEstados } from '../../seed/seed-estados.js';
import { createEstado } from '../estado/estado.service.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { publishRealtime } from '../../realtime/realtime.publisher.js';
import { Lead } from './lead.model.js';
import { createLeadFromConversation, listHistorialEstado, updateLeadEstado } from './lead.service.js';
import type { ILeadLean } from './lead.types.js';

// El cambio de etapa publica un evento de tiempo real. Sin el mock, `publishRealtime` abre una
// conexión Redis real que —con `maxRetriesPerRequest: null`— encola el comando para siempre en vez
// de fallar, y el test se cuelga hasta el timeout.
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

const tenant = new Types.ObjectId();
const tenantStr = tenant.toString();

async function crearCliente(metaUserId: string): Promise<string> {
  const doc = await createScoped(Cliente, tenant, {
    metaUserId,
    telefono: '573001112233',
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

describe('HU-PIPE-01 — mover una oportunidad de etapa', () => {
  let leadId: string;
  let asesorId: string;

  beforeEach(async () => {
    await Lead.deleteMany({});
    await Cliente.deleteMany({});
    await User.deleteMany({});
    await Estado.deleteMany({});
    await AuditEvent.deleteMany({});
    await Lead.syncIndexes();
    await Estado.syncIndexes();
    vi.clearAllMocks();

    await seedEstados(tenant);
    const clienteId = await crearCliente('wa_pipe_01');
    asesorId = await crearAsesor('Carolina');
    const lead = await createLeadFromConversation(tenantStr, asesorId, {
      nombre: 'Ana Pérez',
      telefono: '573001112233',
      clienteId,
    });
    leadId = lead.id;
  });

  // ─── Transiciones (criterios 4 y 5) ──────────────────────────────────────────

  it('mueve el lead a otra etapa activa y el cambio persiste', async () => {
    const movido = await updateLeadEstado(tenantStr, asesorId, leadId, 'en_gestion');

    expect(movido.estado).toBe('en_gestion');
    const enBase = await findByIdScoped(Lead, tenant, leadId).lean<ILeadLean>();
    expect(enBase?.estado).toBe('en_gestion');
  });

  it('permite RETROCEDER: corregir un arrastre equivocado no es un error de negocio', async () => {
    await updateLeadEstado(tenantStr, asesorId, leadId, 'pagado');
    const vuelta = await updateLeadEstado(tenantStr, asesorId, leadId, 'nuevo');

    expect(vuelta.estado).toBe('nuevo');
  });

  it('permite saltar directo a una etapa de salida desde cualquier punto', async () => {
    const declinado = await updateLeadEstado(tenantStr, asesorId, leadId, 'declinado');

    expect(declinado.estado).toBe('declinado');
  });

  it('una etapa ARCHIVADA se rechaza con 400 y NO escribe', async () => {
    await Estado.updateOne({ tenantId: tenant, key: 'pagado' }, { $set: { activo: false } });

    await expect(updateLeadEstado(tenantStr, asesorId, leadId, 'pagado')).rejects.toMatchObject({
      statusCode: 400,
    });

    const intacto = await findByIdScoped(Lead, tenant, leadId).lean<ILeadLean>();
    expect(intacto?.estado).toBe('nuevo');
  });

  it('una clave que no está en el catálogo se rechaza con 400 y NO escribe', async () => {
    await expect(
      updateLeadEstado(tenantStr, asesorId, leadId, 'inventada'),
    ).rejects.toMatchObject({ statusCode: 400 });

    const intacto = await findByIdScoped(Lead, tenant, leadId).lean<ILeadLean>();
    expect(intacto?.estado).toBe('nuevo');
  });

  it('una etapa propia del tenant se puede usar igual que las de fábrica', async () => {
    const propia = await createEstado(tenantStr, { label: 'Visita agendada' });

    const movido = await updateLeadEstado(tenantStr, asesorId, leadId, propia.key);

    expect(movido.estado).toBe('visita-agendada');
  });

  it('reenviar la etapa que ya tiene es idempotente: sin historial y SIN evento', async () => {
    // Es exactamente soltar la tarjeta en la columna de la que salió.
    const igual = await updateLeadEstado(tenantStr, asesorId, leadId, 'nuevo');

    expect(igual.estado).toBe('nuevo');
    expect(await AuditEvent.countDocuments({ tenantId: tenant })).toBe(1); // solo `lead.create`
    expect(publishRealtime).not.toHaveBeenCalled();
  });

  // ─── Auditoría y tiempo real (criterios 6 y 11) ──────────────────────────────

  it('registra el cambio como `lead.estado`, con el valor anterior y el nuevo', async () => {
    await updateLeadEstado(tenantStr, asesorId, leadId, 'en_gestion');

    const evento = await AuditEvent.findOne({ tenantId: tenant, accion: 'lead.estado' }).lean();
    expect(evento).not.toBeNull();
    expect(evento?.antes).toEqual({ estado: 'nuevo' });
    expect(evento?.despues).toEqual({ estado: 'en_gestion' });
    expect(String(evento?.actorId)).toBe(asesorId);
  });

  it('un fallo de la auditoría NO le cuesta el cambio al usuario', async () => {
    vi.spyOn(AuditEvent, 'create').mockRejectedValueOnce(new Error('mongo caído'));

    const movido = await updateLeadEstado(tenantStr, asesorId, leadId, 'en_gestion');

    expect(movido.estado).toBe('en_gestion');
  });

  it('publica `lead:stage-changed` UNA sola vez por cambio efectivo, con origen y destino', async () => {
    await updateLeadEstado(tenantStr, asesorId, leadId, 'en_gestion');

    expect(publishRealtime).toHaveBeenCalledTimes(1);
    expect(publishRealtime).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'lead:stage-changed',
        tenantId: tenantStr,
        leadId,
        de: 'nuevo',
        a: 'en_gestion',
      }),
    );
  });

  // ─── Historial (criterio 7) ──────────────────────────────────────────────────

  it('el historial devuelve los cambios más reciente primero, con el actor resuelto', async () => {
    await updateLeadEstado(tenantStr, asesorId, leadId, 'en_gestion');
    await updateLeadEstado(tenantStr, asesorId, leadId, 'pagado');

    const historial = await listHistorialEstado(tenantStr, leadId, 1, 20);

    expect(historial.total).toBe(2);
    expect(historial.data.map((h) => h.a)).toEqual(['pagado', 'en_gestion']);
    expect(historial.data[0]?.de).toBe('en_gestion');
    expect(historial.data[0]?.actor).toEqual({ id: asesorId, nombre: 'Carolina' });
  });

  it('el historial NO cuela `lead.create`, y el `total` corresponde con las filas', async () => {
    await updateLeadEstado(tenantStr, asesorId, leadId, 'en_gestion');

    const historial = await listHistorialEstado(tenantStr, leadId, 1, 20);

    // En `audit_events` hay 2 eventos (create + estado); el historial de etapa solo ve el suyo.
    expect(await AuditEvent.countDocuments({ tenantId: tenant })).toBe(2);
    expect(historial.total).toBe(1);
    expect(historial.data).toHaveLength(1);
  });

  it('el historial pagina sin romper el `total`', async () => {
    await updateLeadEstado(tenantStr, asesorId, leadId, 'en_gestion');
    await updateLeadEstado(tenantStr, asesorId, leadId, 'pago_pendiente');
    await updateLeadEstado(tenantStr, asesorId, leadId, 'pagado');

    const pagina = await listHistorialEstado(tenantStr, leadId, 2, 2);

    expect(pagina.total).toBe(3);
    expect(pagina.data).toHaveLength(1);
  });

  it('incluye los cambios antiguos, grabados como `lead.update` antes de HU-PIPE-01', async () => {
    // Sin esto, el historial de un lead anterior al feature saldría vacío y parecería que nunca
    // se movió. Los eventos viejos no se migran: se consultan.
    await recordAuditEvent(tenantStr, {
      actorId: asesorId,
      accion: 'lead.update',
      entidad: 'lead',
      entidadId: leadId,
      antes: { estado: 'nuevo' },
      despues: { estado: 'pagado' },
    });

    const historial = await listHistorialEstado(tenantStr, leadId, 1, 20);

    expect(historial.total).toBe(1);
    expect(historial.data[0]?.a).toBe('pagado');
  });

  it('el historial de un lead inexistente es 404, no una página vacía', async () => {
    await expect(
      listHistorialEstado(tenantStr, new Types.ObjectId().toString(), 1, 20),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
