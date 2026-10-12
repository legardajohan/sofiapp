/**
 * HU-MARK-04 — captura de eventos por destinatario y agregación de métricas (criterios 1–5).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Estado } from '../estado/estado.model.js';
import { Lead } from '../lead/lead.model.js';
import { User } from '../users/user.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { seedEstados } from '../../seed/seed-estados.js';
import { Campaign } from './campaign.model.js';
import { CampaignRecipient } from './campaign-recipient.model.js';

vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

vi.mock('../../config/queues.js', async (original) => {
  const real = await original<typeof import('../../config/queues.js')>();
  return { ...real, campaignQueue: { add: vi.fn(), upsertJobScheduler: vi.fn() } };
});

import {
  calcularTasas,
  diasDelRango,
  getCampaignMetrics,
  getCampaignsOverview,
  registrarConversionCampana,
  registrarLectura,
  registrarRespuestaCampana,
} from './campaign.metrics.service.js';
import { applyDeliveryStatusToRecipient } from './campaign.service.js';
import { createLeadFromConversation, updateLeadEstado } from '../lead/lead.service.js';
import type { EstadoDestinatario, LeanCampaign, LeanCampaignRecipient } from './campaign.types.js';

const tenant = new Types.ObjectId();
const tenantStr = tenant.toString();
const HORA = 3_600_000;
const DIA = 24 * HORA;

let telefonos = 0;

async function crearCliente(): Promise<Types.ObjectId> {
  telefonos += 1;
  const doc = await createScoped(Cliente, tenant, {
    metaUserId: `wa_${telefonos}`,
    telefono: `5730000${String(telefonos).padStart(5, '0')}`,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
  });
  return doc._id as Types.ObjectId;
}

async function crearCampana(nombre: string, iniciadaAt: Date | null = new Date()): Promise<Types.ObjectId> {
  const doc = await createScoped(Campaign, tenant, {
    nombre,
    templateId: new Types.ObjectId(),
    parametros: [],
    estado: 'en_curso',
    creadaPor: new Types.ObjectId(),
    iniciadaAt,
  });
  return doc._id as Types.ObjectId;
}

async function crearDestinatario(
  campaignId: Types.ObjectId,
  clienteId: Types.ObjectId,
  opciones: { estado?: EstadoDestinatario; enviadoAt?: Date | null; metaMessageId?: string | null } = {},
): Promise<Types.ObjectId> {
  const estado = opciones.estado ?? 'enviado';
  const doc = await createScoped(CampaignRecipient, tenant, {
    campaignId,
    clienteId,
    telefono: '573000000000',
    estado,
    metaMessageId: opciones.metaMessageId ?? null,
    enviadoAt: opciones.enviadoAt === undefined ? new Date() : opciones.enviadoAt,
  });
  return doc._id as Types.ObjectId;
}

async function leerDestinatario(id: Types.ObjectId): Promise<LeanCampaignRecipient> {
  const doc = await findByIdScoped(CampaignRecipient, tenant, id).lean<LeanCampaignRecipient>();
  if (!doc) throw new Error('destinatario no encontrado');
  return doc;
}

async function entregadosDe(campaignId: Types.ObjectId): Promise<number> {
  const doc = await findByIdScoped(Campaign, tenant, campaignId).lean<LeanCampaign>();
  return doc?.totales.entregados ?? -1;
}

beforeEach(async () => {
  await Promise.all([
    Campaign.deleteMany({}),
    CampaignRecipient.deleteMany({}),
    Cliente.deleteMany({}),
    Lead.deleteMany({}),
    Estado.deleteMany({}),
    User.deleteMany({}),
    AuditEvent.deleteMany({}),
  ]);
  await Promise.all([CampaignRecipient.syncIndexes(), Lead.syncIndexes(), Estado.syncIndexes()]);
  vi.clearAllMocks();
});

describe('HU-MARK-04 — tasas', () => {
  it('denominador 0 → null; redondeo a 4 decimales', () => {
    const tasas = calcularTasas({
      destinatarios: 3,
      enviados: 3,
      entregados: 3,
      leidos: 1,
      respondidos: 2,
      convertidos: 0,
      fallidos: 0,
    });
    expect(tasas).toEqual({ entrega: 1, apertura: 0.3333, respuesta: 0.6667, conversion: 0 });

    const vacias = calcularTasas({
      destinatarios: 1,
      enviados: 0,
      entregados: 0,
      leidos: 0,
      respondidos: 0,
      convertidos: 0,
      fallidos: 1,
    });
    expect(vacias).toEqual({ entrega: null, apertura: null, respuesta: null, conversion: null });
  });
});

describe('HU-MARK-04 — lectura (criterio 1)', () => {
  it('`read` marca leidoAt una sola vez; un duplicado no cambia nada', async () => {
    const campana = await crearCampana('Promo');
    const id = await crearDestinatario(campana, await crearCliente(), {
      estado: 'entregado',
      metaMessageId: 'wamid.1',
    });

    await applyDeliveryStatusToRecipient(tenantStr, 'wamid.1', 'read');
    const primera = (await leerDestinatario(id)).leidoAt;
    expect(primera).toBeInstanceOf(Date);

    await applyDeliveryStatusToRecipient(tenantStr, 'wamid.1', 'read');
    expect((await leerDestinatario(id)).leidoAt?.getTime()).toBe(primera?.getTime());
  });

  it('`read` antes que `delivered` → entregado; el `delivered` tardío no vuelve a sumar', async () => {
    const campana = await crearCampana('Promo');
    const id = await crearDestinatario(campana, await crearCliente(), { metaMessageId: 'wamid.2' });

    await registrarLectura(tenantStr, 'wamid.2', new Date());
    const tras = await leerDestinatario(id);
    expect(tras.estado).toBe('entregado');
    expect(tras.entregadoAt).toBeInstanceOf(Date);
    expect(tras.leidoAt).toBeInstanceOf(Date);
    expect(await entregadosDe(campana)).toBe(1);

    await applyDeliveryStatusToRecipient(tenantStr, 'wamid.2', 'delivered');
    expect(await entregadosDe(campana)).toBe(1);
  });

  it('`delivered` deja su marca de tiempo', async () => {
    const campana = await crearCampana('Promo');
    const id = await crearDestinatario(campana, await crearCliente(), { metaMessageId: 'wamid.3' });

    await applyDeliveryStatusToRecipient(tenantStr, 'wamid.3', 'delivered');
    const tras = await leerDestinatario(id);
    expect(tras.estado).toBe('entregado');
    expect(tras.entregadoAt).toBeInstanceOf(Date);
    expect(tras.leidoAt).toBeNull();
  });

  it('un `read` sobre un fallido no lo marca como leído', async () => {
    const campana = await crearCampana('Promo');
    const id = await crearDestinatario(campana, await crearCliente(), {
      estado: 'fallido',
      metaMessageId: 'wamid.4',
    });

    await registrarLectura(tenantStr, 'wamid.4', new Date());
    const tras = await leerDestinatario(id);
    expect(tras.estado).toBe('fallido');
    expect(tras.leidoAt).toBeNull();
  });
});

describe('HU-MARK-04 — respuesta (criterio 2)', () => {
  it('dentro de la ventana marca respondido, leído y entregado', async () => {
    const campana = await crearCampana('Promo');
    const cliente = await crearCliente();
    const id = await crearDestinatario(campana, cliente, { enviadoAt: new Date(Date.now() - HORA) });

    await registrarRespuestaCampana(tenantStr, cliente.toString(), new Date());
    const tras = await leerDestinatario(id);
    expect(tras.respondidoAt).toBeInstanceOf(Date);
    expect(tras.leidoAt).toBeInstanceOf(Date);
    expect(tras.estado).toBe('entregado');
  });

  it('fuera de la ventana (72 h) → no-op', async () => {
    const campana = await crearCampana('Promo');
    const cliente = await crearCliente();
    const id = await crearDestinatario(campana, cliente, {
      enviadoAt: new Date(Date.now() - 73 * HORA),
    });

    await registrarRespuestaCampana(tenantStr, cliente.toString(), new Date());
    expect((await leerDestinatario(id)).respondidoAt).toBeNull();
  });

  it('sin campaña previa → no-op y sin error', async () => {
    const cliente = await crearCliente();
    await expect(
      registrarRespuestaCampana(tenantStr, cliente.toString(), new Date()),
    ).resolves.toBeUndefined();
  });

  it('last-touch: va a la campaña más reciente y una segunda respuesta no cae a la anterior', async () => {
    const cliente = await crearCliente();
    const vieja = await crearDestinatario(await crearCampana('Vieja'), cliente, {
      enviadoAt: new Date(Date.now() - 10 * HORA),
    });
    const nueva = await crearDestinatario(await crearCampana('Nueva'), cliente, {
      enviadoAt: new Date(Date.now() - HORA),
    });

    await registrarRespuestaCampana(tenantStr, cliente.toString(), new Date());
    await registrarRespuestaCampana(tenantStr, cliente.toString(), new Date());

    expect((await leerDestinatario(nueva)).respondidoAt).toBeInstanceOf(Date);
    expect((await leerDestinatario(vieja)).respondidoAt).toBeNull();
  });
});

describe('HU-MARK-04 — conversión (criterio 3)', () => {
  async function prepararLead(): Promise<{ leadId: string; destinatario: Types.ObjectId; actor: string }> {
    await seedEstados(tenant);
    const cliente = await crearCliente();
    const actor = await createScoped(User, tenant, {
      nombre: 'Asesor',
      email: `asesor-${cliente.toString()}@empresa.test`,
      passwordHash: 'x',
      rol: 'admin',
      activo: true,
    });
    const lead = await createLeadFromConversation(tenantStr, String(actor._id), {
      nombre: 'Ana',
      telefono: '573009998877',
      clienteId: cliente.toString(),
    });
    const destinatario = await crearDestinatario(await crearCampana('Promo'), cliente, {
      estado: 'entregado',
      enviadoAt: new Date(Date.now() - DIA),
    });
    return { leadId: lead.id, destinatario, actor: String(actor._id) };
  }

  it('entrar a `pagado` (esConversion de fábrica) marca convertidoAt', async () => {
    const { leadId, destinatario, actor } = await prepararLead();

    await updateLeadEstado(tenantStr, actor, leadId, 'en_gestion');
    expect((await leerDestinatario(destinatario)).convertidoAt).toBeNull();

    await updateLeadEstado(tenantStr, actor, leadId, 'pagado');
    expect((await leerDestinatario(destinatario)).convertidoAt).toBeInstanceOf(Date);
  });

  it('salir y volver a entrar no recuenta', async () => {
    const { leadId, destinatario, actor } = await prepararLead();

    await updateLeadEstado(tenantStr, actor, leadId, 'pagado');
    const primera = (await leerDestinatario(destinatario)).convertidoAt;
    await updateLeadEstado(tenantStr, actor, leadId, 'en_gestion');
    await updateLeadEstado(tenantStr, actor, leadId, 'pagado');

    expect((await leerDestinatario(destinatario)).convertidoAt?.getTime()).toBe(primera?.getTime());
  });

  it('fuera de la ventana (14 d) → no-op', async () => {
    const campana = await crearCampana('Vieja');
    const cliente = await crearCliente();
    const id = await crearDestinatario(campana, cliente, {
      estado: 'entregado',
      enviadoAt: new Date(Date.now() - 15 * DIA),
    });

    await registrarConversionCampana(tenantStr, cliente.toString(), new Date());
    expect((await leerDestinatario(id)).convertidoAt).toBeNull();
  });
});

describe('HU-MARK-04 — agregación (criterios 4 y 5)', () => {
  it('getCampaignMetrics cuadra con los destinatarios reales', async () => {
    const campana = await crearCampana('Promo');
    const marcas = { leidoAt: new Date(), respondidoAt: new Date(), convertidoAt: new Date() };

    const a = await crearDestinatario(campana, await crearCliente(), { estado: 'entregado' });
    await CampaignRecipient.updateOne({ _id: a }, { $set: marcas });
    const b = await crearDestinatario(campana, await crearCliente(), { estado: 'entregado' });
    await CampaignRecipient.updateOne({ _id: b }, { $set: { leidoAt: new Date() } });
    await crearDestinatario(campana, await crearCliente(), { estado: 'enviado' });
    await crearDestinatario(campana, await crearCliente(), { estado: 'fallido' });
    await crearDestinatario(campana, await crearCliente(), { estado: 'pendiente', enviadoAt: null });
    await crearDestinatario(campana, await crearCliente(), { estado: 'omitido', enviadoAt: null });

    const m = await getCampaignMetrics(tenantStr, campana.toString());
    expect(m).toMatchObject({
      campaignId: campana.toString(),
      destinatarios: 6,
      enviados: 3,
      entregados: 2,
      leidos: 2,
      respondidos: 1,
      convertidos: 1,
      fallidos: 1,
      tasas: { entrega: 0.6667, apertura: 1, respuesta: 0.5, conversion: 0.5 },
      ventanas: { respuestaHoras: 72, conversionDias: 14 },
    });
  });

  it('campaña sin destinatarios → ceros y tasas null', async () => {
    const campana = await crearCampana('Vacía', null);
    const m = await getCampaignMetrics(tenantStr, campana.toString());
    expect(m.destinatarios).toBe(0);
    expect(m.tasas.entrega).toBeNull();
  });

  it('getCampaignsOverview suma solo las iniciadas en el rango y ordena por respuesta', async () => {
    const ahora = Date.now();
    const floja = await crearCampana('Floja', new Date(ahora - DIA));
    const buena = await crearCampana('Buena', new Date(ahora - 2 * DIA));
    const fuera = await crearCampana('Fuera', new Date(ahora - 40 * DIA));

    await crearDestinatario(floja, await crearCliente(), { estado: 'entregado' });
    await crearDestinatario(floja, await crearCliente(), { estado: 'entregado' });
    const r = await crearDestinatario(buena, await crearCliente(), { estado: 'entregado' });
    await CampaignRecipient.updateOne({ _id: r }, { $set: { respondidoAt: new Date() } });
    await crearDestinatario(fuera, await crearCliente(), { estado: 'entregado' });

    const o = await getCampaignsOverview(tenantStr, {
      desde: new Date(ahora - 30 * DIA),
      hasta: new Date(ahora),
    });

    expect(o.totalCampanas).toBe(2);
    expect(o.enviados).toBe(3);
    expect(o.respondidos).toBe(1);
    expect(o.campanas.map((c) => c.nombre)).toEqual(['Buena', 'Floja']);
  });
});

describe('HU-MARK-04 — serie diaria', () => {
  it('diasDelRango enumera cada día de la zona, en orden y sin repetir', () => {
    const dias = diasDelRango(
      new Date('2026-10-01T12:00:00Z'),
      new Date('2026-10-04T12:00:00Z'),
      'America/Bogota',
    );
    expect(dias).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  });

  it('cada evento cae en el día de su propia marca, en la zona pedida, con ceros en los huecos', async () => {
    const iniciadaAt = new Date('2026-10-01T15:00:00Z');
    const campana = await crearCampana('Promo', iniciadaAt);

    // Enviado el 1 a las 10 a. m. de Bogotá; respondido el 2 a las 9 p. m. de Bogotá (ya el 3 en UTC).
    const a = await crearDestinatario(campana, await crearCliente(), {
      estado: 'entregado',
      enviadoAt: new Date('2026-10-01T15:00:00Z'),
    });
    await CampaignRecipient.updateOne(
      { _id: a },
      { $set: { respondidoAt: new Date('2026-10-03T02:00:00Z') } },
    );
    // Un fallido no se dibuja como enviado.
    await crearDestinatario(campana, await crearCliente(), {
      estado: 'fallido',
      enviadoAt: new Date('2026-10-01T15:05:00Z'),
    });

    const o = await getCampaignsOverview(tenantStr, {
      desde: new Date('2026-10-01T05:00:00Z'),
      hasta: new Date('2026-10-03T23:00:00Z'),
      zona: 'America/Bogota',
    });

    expect(o.serie).toEqual([
      { dia: '2026-10-01', enviados: 1, respondidos: 0, convertidos: 0 },
      { dia: '2026-10-02', enviados: 0, respondidos: 1, convertidos: 0 },
      { dia: '2026-10-03', enviados: 0, respondidos: 0, convertidos: 0 },
    ]);
  });

  it('una campaña sin arrancar devuelve la serie vacía', async () => {
    const campana = await crearCampana('Borrador', null);
    const m = await getCampaignMetrics(tenantStr, campana.toString(), 'America/Bogota');
    expect(m.serie).toEqual([]);
  });
});
