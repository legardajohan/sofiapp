/**
 * HU-MARK-05 — lo que un envío por plantilla deja en el hilo y cómo evoluciona su estado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

vi.mock('../../integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: vi.fn(), sendTemplate: vi.fn() },
}));

const publishRealtime = vi.fn();
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: (...args: unknown[]) => publishRealtime(...args),
}));

import { metaWhatsAppClient } from '../../integrations/meta/meta-whatsapp.client.js';
import { createScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Campaign } from '../campaign/campaign.model.js';
import { CampaignRecipient } from '../campaign/campaign-recipient.model.js';
import { WhatsAppTemplate } from '../whatsapp-template/whatsapp-template.model.js';
import { Message } from './message.model.js';
import { sendOutbound, updateDeliveryStatus } from './message.service.js';
import type { MessageStatus } from './message.types.js';

async function preparar(
  tenantId: Types.ObjectId,
): Promise<{ clienteId: string; templateId: string }> {
  await createScoped(MetaIntegration, tenantId, {
    canal: 'whatsapp',
    wabaId: 'waba-1',
    phoneNumberId: `phone-${String(tenantId)}`,
    accessTokenEnc: encrypt('token'),
    activo: true,
  });
  const cliente = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${String(new Types.ObjectId())}`,
    telefono: '573001112233',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
  });
  const plantilla = await createScoped(WhatsAppTemplate, tenantId, {
    metaTemplateId: `meta-${String(new Types.ObjectId())}`,
    name: 'promo_icfes',
    language: 'es_CO',
    category: 'MARKETING',
    status: 'APPROVED',
    components: [
      { type: 'BODY', text: 'Hola {{1}}, tenemos cupos para el {{2}}.' },
      { type: 'FOOTER', text: 'Pre-ICFES' },
    ],
    parametrosBody: 2,
    syncedAt: new Date(),
    obsoleta: false,
  });
  return { clienteId: String(cliente._id), templateId: String(plantilla._id) };
}

describe('sendOutbound plantilla — contenido real en el hilo (HU-MARK-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('guarda el texto renderizado y la foto de la plantilla, sin cambiar el tipo', async () => {
    const tenantId = new Types.ObjectId();
    const { clienteId, templateId } = await preparar(tenantId);
    vi.mocked(metaWhatsAppClient.sendTemplate).mockResolvedValueOnce({ messageId: 'wamid.T1' });

    const message = await sendOutbound(tenantId, clienteId, {
      modo: 'plantilla',
      templateId,
      parametros: ['Ana', 'sábado'],
    });

    // `plantilla` se conserva: el presupuesto de 24 h cuenta por este tipo.
    expect(message.tipo).toBe('plantilla');
    expect(message.texto).toBe('Hola Ana, tenemos cupos para el sábado.\n\nPre-ICFES');
    expect(message.plantilla).toMatchObject({
      nombre: 'promo_icfes',
      idioma: 'es_CO',
      parametros: ['Ana', 'sábado'],
    });
    expect(String(message.plantilla?.templateId)).toBe(templateId);
    // Sin contexto de campaña no se inventa un origen.
    expect(message.origen).toBeUndefined();
    expect(message.campaignId).toBeUndefined();
  });

  it('con contexto de campaña liga el mensaje a ella y guarda la imagen como media disponible', async () => {
    const tenantId = new Types.ObjectId();
    const { clienteId, templateId } = await preparar(tenantId);
    await WhatsAppTemplate.updateOne(
      { _id: templateId },
      { $push: { components: { $each: [{ type: 'HEADER', format: 'IMAGE' }], $position: 0 } } },
    );
    vi.mocked(metaWhatsAppClient.sendTemplate).mockResolvedValueOnce({ messageId: 'wamid.T2' });
    const campaignId = String(new Types.ObjectId());

    const message = await sendOutbound(
      tenantId,
      clienteId,
      {
        modo: 'plantilla',
        templateId,
        parametros: ['Ana', 'sábado'],
        imagenCabecera: { metaMediaId: 'meta-img-1' },
      },
      'bot',
      {
        campaignId,
        mediaCabecera: {
          mediaKey: 'campaigns/x/imagen.jpg',
          mimeType: 'image/jpeg',
          tamanoBytes: 2048,
        },
      },
    );

    expect(message.origen).toBe('campana');
    expect(String(message.campaignId)).toBe(campaignId);
    expect(message.media).toMatchObject({
      estado: 'disponible',
      mimeType: 'image/jpeg',
      mediaKey: 'campaigns/x/imagen.jpg',
      metaMediaId: 'meta-img-1',
      tamanoBytes: 2048,
    });
    expect(message.metaMessageId).toBe('wamid.T2');
  });
});

describe('updateDeliveryStatus — solo avanza y avisa en vivo (HU-MARK-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function mensajeCon(
    tenantId: Types.ObjectId,
    status: MessageStatus,
    extra: Record<string, unknown> = {},
  ): Promise<{ id: Types.ObjectId; metaMessageId: string }> {
    const metaMessageId = `wamid.${String(new Types.ObjectId())}`;
    const doc = await createScoped(Message, tenantId, {
      clienteId: new Types.ObjectId(),
      canal: 'whatsapp',
      direccion: 'outbound',
      sender: 'bot',
      tipo: 'plantilla',
      texto: 'Hola',
      metaMessageId,
      status,
      ...extra,
    });
    return { id: doc._id as Types.ObjectId, metaMessageId };
  }

  async function estadoDe(id: Types.ObjectId): Promise<string | undefined> {
    return (await Message.findById(id).lean())?.status;
  }

  it('avanza sent → delivered → read y publica message:updated en cada paso', async () => {
    const tenantId = new Types.ObjectId();
    const { id, metaMessageId } = await mensajeCon(tenantId, 'sent');

    await updateDeliveryStatus(tenantId, metaMessageId, 'delivered');
    expect(await estadoDe(id)).toBe('delivered');
    await updateDeliveryStatus(tenantId, metaMessageId, 'read');
    expect(await estadoDe(id)).toBe('read');

    expect(publishRealtime).toHaveBeenCalledTimes(2);
    expect(publishRealtime).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'message:updated',
        tenantId: String(tenantId),
        message: expect.objectContaining({ id: String(id), status: 'read' }),
      }),
    );
  });

  it('un delivered tardío no hace retroceder un read, y no publica nada', async () => {
    const tenantId = new Types.ObjectId();
    const { id, metaMessageId } = await mensajeCon(tenantId, 'read');

    await updateDeliveryStatus(tenantId, metaMessageId, 'delivered');

    expect(await estadoDe(id)).toBe('read');
    expect(publishRealtime).not.toHaveBeenCalled();
  });

  it('un estado que no avanza el Message igual llega al destinatario de campaña (métricas HU-MARK-04)', async () => {
    const tenantId = new Types.ObjectId();
    // Meta puede entregar el `read` antes que el `delivered`: el hilo ya está en `read`.
    const { id, metaMessageId } = await mensajeCon(tenantId, 'read');
    const recipient = await createScoped(CampaignRecipient, tenantId, {
      campaignId: new Types.ObjectId(),
      clienteId: new Types.ObjectId(),
      telefono: '573001112233',
      estado: 'enviado',
      metaMessageId,
    });

    await updateDeliveryStatus(tenantId, metaMessageId, 'delivered');

    expect(await estadoDe(id)).toBe('read');
    const actualizado = await CampaignRecipient.findById(recipient._id).lean();
    expect(actualizado?.estado).toBe('entregado');
    expect(actualizado?.entregadoAt).toBeInstanceOf(Date);
  });

  it('failed no pisa read, pero sí delivered', async () => {
    const tenantId = new Types.ObjectId();
    const leido = await mensajeCon(tenantId, 'read');
    const entregado = await mensajeCon(tenantId, 'delivered');

    await updateDeliveryStatus(tenantId, leido.metaMessageId, 'failed');
    await updateDeliveryStatus(tenantId, entregado.metaMessageId, 'failed');

    expect(await estadoDe(leido.id)).toBe('read');
    expect(await estadoDe(entregado.id)).toBe('failed');
  });

  it('el evento lleva el nombre de la campaña para que la burbuja conserve su etiqueta', async () => {
    const tenantId = new Types.ObjectId();
    const campana = await createScoped(Campaign, tenantId, {
      nombre: 'Promo sábado',
      filtros: {},
      templateId: new Types.ObjectId(),
      parametros: [],
      creadaPor: new Types.ObjectId(),
    });
    const { metaMessageId } = await mensajeCon(tenantId, 'sent', {
      origen: 'campana',
      campaignId: campana._id,
    });

    await updateDeliveryStatus(tenantId, metaMessageId, 'delivered');

    expect(publishRealtime).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          origen: 'campana',
          campana: { id: String(campana._id), nombre: 'Promo sábado' },
        }),
      }),
    );
  });
});
