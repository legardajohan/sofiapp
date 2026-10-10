import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { WhatsAppTemplate } from '../whatsapp-template/whatsapp-template.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Lead } from '../lead/lead.model.js';
import { Campaign } from './campaign.model.js';
import { CampaignRecipient } from './campaign-recipient.model.js';

// La cola no debe tocar Redis en los tests: solo se comprueba que se encola.
vi.mock('../../config/queues.js', async (original) => {
  const real = await original<typeof import('../../config/queues.js')>();
  return { ...real, campaignQueue: { add: vi.fn(), upsertJobScheduler: vi.fn() } };
});

// El sondeo de tier sale a la Graph API: se fija en verde para que el pacing no bloquee.
vi.mock('../../integrations/meta/meta-phone-number.client.js', () => ({
  metaPhoneNumberClient: {
    getHealth: vi.fn().mockResolvedValue({
      messagingTier: 'TIER_1K',
      qualityRating: 'GREEN',
      healthStatus: 'AVAILABLE',
    }),
  },
}));

import {
  facetasSegmento,
  listarAudiencia,
  previewSegmento,
} from './campaign.segment.service.js';
import { createCampaign } from './campaign.service.js';
import type { ISegmentoFiltros } from './campaign.types.js';

const tenantId = new Types.ObjectId();
const etiquetaVip = new Types.ObjectId();
const etiquetaFeria = new Types.ObjectId();

interface ContactoSeed {
  nombre: string;
  telefono: string;
  etapa?: string;
  tagIds?: Types.ObjectId[];
  marketingOptOut?: boolean;
  ultimoMensajeAt?: Date;
}

async function sembrar(seed: ContactoSeed): Promise<Types.ObjectId> {
  const cliente = await createScoped(Cliente, tenantId, {
    metaUserId: `meta-${seed.nombre}`,
    telefono: seed.telefono,
    nombre: seed.nombre,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    marketingOptOut: seed.marketingOptOut ?? false,
    tagIds: seed.tagIds ?? [],
    ultimoMensajeAt: seed.ultimoMensajeAt ?? new Date(),
  });

  if (seed.etapa) {
    await createScoped(Lead, tenantId, {
      nombre: seed.nombre,
      telefono: seed.telefono,
      clienteId: cliente._id,
      origen: {
        tipo: 'conversacion',
        conversacionId: cliente._id,
        convertidoPor: new Types.ObjectId(),
        convertidoAt: new Date(),
      },
      responsableId: new Types.ObjectId(),
      estado: seed.etapa,
    });
  }

  return cliente._id;
}

async function nombres(filtros: ISegmentoFiltros): Promise<string[]> {
  const { data } = await listarAudiencia(tenantId, filtros, { page: 1, limit: 50 });
  return data.filter((c) => !c.excluido).map((c) => c.nombre ?? '').sort();
}

describe('Constructor de audiencias — etapas, etiquetas, exclusiones y duplicados', () => {
  const ids: Record<string, Types.ObjectId> = {};

  beforeEach(async () => {
    await Promise.all([
      Cliente.deleteMany({}),
      Lead.deleteMany({}),
      Campaign.deleteMany({}),
      CampaignRecipient.deleteMany({}),
      MetaIntegration.deleteMany({}),
      WhatsAppTemplate.deleteMany({}),
    ]);
    await Promise.all([Cliente.syncIndexes(), CampaignRecipient.syncIndexes()]);

    ids.ana = await sembrar({ nombre: 'Ana', telefono: '573000000001', etapa: 'nuevo', tagIds: [etiquetaVip] });
    ids.bruno = await sembrar({ nombre: 'Bruno', telefono: '573000000002', etapa: 'nuevo' });
    ids.carla = await sembrar({ nombre: 'Carla', telefono: '573000000003', etapa: 'pagado', tagIds: [etiquetaVip] });
    ids.dario = await sembrar({ nombre: 'Dario', telefono: '573000000004', tagIds: [etiquetaFeria] });
    // Misma persona registrada dos veces: mismo teléfono que Ana, otra ficha. Sin lead: `Lead`
    // tiene teléfono único por tenant, así que la ficha repetida solo puede entrar por etiqueta.
    ids.anaBis = await sembrar({ nombre: 'Ana (repetida)', telefono: '573000000001', tagIds: [etiquetaVip] });
    ids.baja = await sembrar({
      nombre: 'Baja',
      telefono: '573000000009',
      etapa: 'nuevo',
      tagIds: [etiquetaVip],
      marketingOptOut: true,
    });
  });

  it('filtra por etapa del CRM resolviendo el salto Cliente ← Lead.estado', async () => {
    expect(await nombres({ etapas: ['pagado'] })).toEqual(['Carla']);
    expect(await nombres({ etapas: ['nuevo'] })).toEqual(['Ana', 'Bruno']);
  });

  it('una etapa que no existe da segmento VACÍO, nunca la base entera', async () => {
    const { total } = await previewSegmento(tenantId, { etapas: ['no-existe'] });
    expect(total).toBe(0);
  });

  it('etapas Y etiquetas por defecto: tiene que cumplir las dos', async () => {
    expect(await nombres({ etapas: ['nuevo'], tagIds: [etiquetaVip.toString()] })).toEqual(['Ana']);
    expect(
      await nombres({ etapas: ['nuevo'], tagIds: [etiquetaVip.toString()], combinacion: 'y' }),
    ).toEqual(['Ana']);
  });

  it('etapas O etiquetas: basta con una, y quien cumple ambas sale una sola vez', async () => {
    const lista = await nombres({
      etapas: ['pagado'],
      tagIds: [etiquetaVip.toString(), etiquetaFeria.toString()],
      combinacion: 'o',
    });
    // Carla está en «pagado» Y es VIP: aparece una vez, no dos.
    expect(lista).toEqual(['Ana', 'Ana (repetida)', 'Carla', 'Dario']);
  });

  it('la combinación no afecta a quien solo filtra por etiquetas', async () => {
    expect(await nombres({ tagIds: [etiquetaVip.toString()], combinacion: 'o' })).toEqual([
      'Ana',
      'Ana (repetida)',
      'Carla',
    ]);
  });

  it('el resumen cuadra: coinciden = válidos + bajas + excluidos a mano + duplicados', async () => {
    const { total, resumen } = await previewSegmento(tenantId, {
      tagIds: [etiquetaVip.toString()],
      excluirClienteIds: [ids.carla!.toString()],
    });

    expect(resumen).toEqual({
      coinciden: 4, // Ana, Ana (repetida), Carla, Baja
      bajas: 1,
      excluidosAMano: 1,
      duplicados: 1, // las dos fichas de Ana comparten teléfono
      validos: 1,
    });
    expect(total).toBe(resumen.validos);
    expect(resumen.validos + resumen.bajas + resumen.excluidosAMano + resumen.duplicados).toBe(
      resumen.coinciden,
    );
  });

  it('excluir a mano solo resta: un id ajeno al segmento no mete a nadie', async () => {
    const { total } = await previewSegmento(tenantId, {
      etapas: ['pagado'],
      excluirClienteIds: [ids.dario!.toString()],
    });
    expect(total).toBe(1);
  });

  it('el listado marca a los excluidos a mano en vez de esconderlos, y nunca enseña bajas', async () => {
    const { data } = await listarAudiencia(
      tenantId,
      { etapas: ['nuevo'], excluirClienteIds: [ids.bruno!.toString()] },
      { page: 1, limit: 50 },
    );

    const bruno = data.find((c) => c.nombre === 'Bruno');
    expect(bruno?.excluido).toBe(true);
    expect(data.map((c) => c.nombre)).not.toContain('Baja');
  });

  it('busca por nombre o teléfono, sin interpretar la búsqueda como regex', async () => {
    const porNombre = await listarAudiencia(tenantId, {}, { busqueda: 'carl', page: 1, limit: 20 });
    expect(porNombre.data.map((c) => c.nombre)).toEqual(['Carla']);

    const porTelefono = await listarAudiencia(tenantId, {}, { busqueda: '0004', page: 1, limit: 20 });
    expect(porTelefono.data.map((c) => c.nombre)).toEqual(['Dario']);

    // Un paréntesis suelto rompería una `RegExp` sin escapar.
    const raro = await listarAudiencia(tenantId, {}, { busqueda: '(repetida', page: 1, limit: 20 });
    expect(raro.data.map((c) => c.nombre)).toEqual(['Ana (repetida)']);
  });

  it('pagina sin repetir ni perder contactos', async () => {
    const p1 = await listarAudiencia(tenantId, {}, { page: 1, limit: 2 });
    const p2 = await listarAudiencia(tenantId, {}, { page: 2, limit: 2 });
    const p3 = await listarAudiencia(tenantId, {}, { page: 3, limit: 2 });

    expect(p1.total).toBe(5);
    const todos = [...p1.data, ...p2.data, ...p3.data].map((c) => c.id);
    expect(new Set(todos).size).toBe(5);
  });

  it('las facetas cuentan contactos alcanzables (sin bajas) por etapa y por etiqueta', async () => {
    const facetas = await facetasSegmento(tenantId);

    const porEtapa = Object.fromEntries(facetas.etapas.map((e) => [e.key, e.contactos]));
    expect(porEtapa).toEqual({ nuevo: 2, pagado: 1 });

    const porEtiqueta = Object.fromEntries(facetas.etiquetas.map((e) => [e.tagId, e.contactos]));
    expect(porEtiqueta).toEqual({ [etiquetaVip.toString()]: 3, [etiquetaFeria.toString()]: 1 });
  });

  it('al lanzar solo se escribe a quien cumple los filtros: sin excluidos, sin bajas y un mensaje por teléfono', async () => {
    await createScoped(MetaIntegration, tenantId, {
      canal: 'whatsapp',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessTokenEnc: encrypt('token'),
      activo: true,
    });
    const plantilla = await createScoped(WhatsAppTemplate, tenantId, {
      metaTemplateId: 'meta-1',
      name: 'promo',
      language: 'es',
      category: 'MARKETING',
      status: 'APPROVED',
      components: [{ type: 'BODY', text: 'Hola.' }],
      parametrosBody: 0,
    });

    const filtros: ISegmentoFiltros = {
      etapas: ['nuevo'],
      tagIds: [etiquetaVip.toString(), etiquetaFeria.toString()],
      combinacion: 'o',
      excluirClienteIds: [ids.bruno!.toString()],
    };
    const { total } = await previewSegmento(tenantId, filtros);

    const campana = await createCampaign(tenantId, new Types.ObjectId().toString(), {
      nombre: 'Promo',
      filtros,
      templateId: plantilla._id.toString(),
      parametros: [],
      lanzar: true,
    });

    const destinatarios = await CampaignRecipient.find({ tenantId, campaignId: campana.id }).lean();
    const telefonos = destinatarios.map((d) => d.telefono).sort();

    // Ana (una sola vez aunque tenga dos fichas), Carla y Dario. Ni Bruno (excluido) ni la baja.
    expect(telefonos).toEqual(['573000000001', '573000000003', '573000000004']);
    // Lo que se prometió en la vista previa es lo que se materializa.
    expect(destinatarios).toHaveLength(total);
    // Y los filtros nuevos sobreviven al guardado: el modelo no los descarta.
    const guardada = await Campaign.findOne({ tenantId, _id: campana.id }).lean();
    expect(guardada?.filtros.etapas).toEqual(['nuevo']);
    expect(guardada?.filtros.combinacion).toBe('o');
    expect(guardada?.filtros.excluirClienteIds?.map(String)).toEqual([ids.bruno!.toString()]);
  });
});
