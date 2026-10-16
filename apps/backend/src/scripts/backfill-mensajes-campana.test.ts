/**
 * Backfill HU-MARK-05: recuperar el contenido de los mensajes de campaña guardados vacíos.
 *
 * Hay que garantizar que reconstruya texto, origen, campaña e imagen; que `--dry-run` no escriba;
 * que sea idempotente; que reporte lo que no se puede recuperar; y que trabaje tenant por tenant.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../repositories/base.repository.js';
import { Message } from '../features/message/message.model.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { Campaign } from '../features/campaign/campaign.model.js';
import { CampaignRecipient } from '../features/campaign/campaign-recipient.model.js';
import { WhatsAppTemplate } from '../features/whatsapp-template/whatsapp-template.model.js';
import { backfillMensajesCampana } from './backfill-mensajes-campana.js';

interface Escenario {
  tenantId: Types.ObjectId;
  mensajeId: Types.ObjectId;
  campaignId: Types.ObjectId;
}

/** Un envío de campaña tal como lo dejaba el código anterior a HU-MARK-05: vacío. */
async function sembrarEnvioVacio(
  conImagen = false,
  tenantId = new Types.ObjectId(),
): Promise<Escenario> {
  const plantilla = await createScoped(WhatsAppTemplate, tenantId, {
    metaTemplateId: `meta-${String(new Types.ObjectId())}`,
    name: 'promo_icfes',
    language: 'es',
    category: 'MARKETING',
    status: 'APPROVED',
    components: [{ type: 'BODY', text: 'Hola {{1}}, hay cupos.' }],
    parametrosBody: 1,
    syncedAt: new Date(),
    obsoleta: false,
  });
  const campana = await createScoped(Campaign, tenantId, {
    nombre: 'Promo',
    filtros: {},
    templateId: plantilla._id,
    parametros: ['estudiante'],
    ...(conImagen
      ? {
          contenido: {
            imagen: {
              mediaKey: 'campaigns/p/imagen.jpg',
              mimeType: 'image/jpeg',
              tamanoBytes: 1234,
              metaMediaId: 'meta-img',
            },
          },
        }
      : {}),
    estado: 'completada',
    creadaPor: new Types.ObjectId(),
  });
  const cliente = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${String(new Types.ObjectId())}`,
    telefono: '573001112233',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
  });
  const metaMessageId = `wamid.${String(new Types.ObjectId())}`;
  await createScoped(CampaignRecipient, tenantId, {
    campaignId: campana._id,
    clienteId: cliente._id,
    telefono: cliente.telefono,
    estado: 'enviado',
    metaMessageId,
  });
  const mensaje = await createScoped(Message, tenantId, {
    clienteId: cliente._id,
    canal: 'whatsapp',
    direccion: 'outbound',
    sender: 'bot',
    tipo: 'plantilla',
    metaMessageId,
    status: 'delivered',
  });
  return {
    tenantId,
    mensajeId: mensaje._id as Types.ObjectId,
    campaignId: campana._id as Types.ObjectId,
  };
}

describe('backfillMensajesCampana (HU-MARK-05)', () => {
  beforeEach(async () => {
    await Promise.all([
      Message.deleteMany({}),
      Campaign.deleteMany({}),
      CampaignRecipient.deleteMany({}),
      WhatsAppTemplate.deleteMany({}),
      Cliente.deleteMany({}),
    ]);
  });

  it('reconstruye texto, origen, campaña y plantilla, sin tocar el estado de entrega', async () => {
    const { tenantId, mensajeId, campaignId } = await sembrarEnvioVacio();

    const reporte = await backfillMensajesCampana(tenantId);

    expect(reporte).toMatchObject({ candidatos: 1, recuperados: 1, duplicados: [] });
    const doc = await Message.findById(mensajeId).lean();
    expect(doc?.texto).toBe('Hola estudiante, hay cupos.');
    expect(doc?.origen).toBe('campana');
    expect(String(doc?.campaignId)).toBe(String(campaignId));
    expect(doc?.plantilla).toMatchObject({ nombre: 'promo_icfes', parametros: ['estudiante'] });
    expect(doc?.status).toBe('delivered');
  });

  it('recupera la imagen de cabecera de la campaña como media disponible', async () => {
    const { tenantId, mensajeId } = await sembrarEnvioVacio(true);

    await backfillMensajesCampana(tenantId);

    const doc = await Message.findById(mensajeId).lean();
    expect(doc?.media).toMatchObject({
      estado: 'disponible',
      mediaKey: 'campaigns/p/imagen.jpg',
      mimeType: 'image/jpeg',
    });
  });

  it('sin imagen propia en la campaña, recupera la imagen por defecto de la plantilla (HT-WA-04)', async () => {
    const { tenantId, mensajeId } = await sembrarEnvioVacio();
    await WhatsAppTemplate.updateOne(
      { tenantId },
      {
        $set: {
          components: [
            { type: 'HEADER', format: 'IMAGE' },
            { type: 'BODY', text: 'Hola {{1}}, hay cupos.' },
          ],
          imagenDefecto: {
            mediaKey: 'templates/p/defecto.png',
            mimeType: 'image/png',
            tamanoBytes: 999,
            metaMediaId: 'meta-defecto',
            subidaMetaAt: new Date(),
          },
        },
      },
    );

    await backfillMensajesCampana(tenantId);

    const doc = await Message.findById(mensajeId).lean();
    expect(doc?.media).toMatchObject({
      estado: 'disponible',
      mediaKey: 'templates/p/defecto.png',
      mimeType: 'image/png',
    });
  });

  it('una plantilla de solo texto no inventa media aunque tenga datos de imagen viejos', async () => {
    const { tenantId, mensajeId } = await sembrarEnvioVacio();
    await WhatsAppTemplate.updateOne(
      { tenantId },
      {
        $set: {
          imagenDefecto: {
            mediaKey: 'templates/p/huerfana.png',
            mimeType: 'image/png',
            tamanoBytes: 1,
            metaMediaId: null,
            subidaMetaAt: null,
          },
        },
      },
    );

    await backfillMensajesCampana(tenantId);

    expect((await Message.findById(mensajeId).lean())?.media).toBeFalsy();
  });

  it('--dry-run cuenta pero no escribe', async () => {
    const { tenantId, mensajeId } = await sembrarEnvioVacio();

    const reporte = await backfillMensajesCampana(tenantId, true);

    expect(reporte.recuperados).toBe(1);
    const doc = await Message.findById(mensajeId).lean();
    expect(doc?.texto).toBeUndefined();
    expect(doc?.origen).toBeUndefined();
  });

  it('es idempotente: la segunda pasada no encuentra nada que hacer', async () => {
    const { tenantId } = await sembrarEnvioVacio();

    await backfillMensajesCampana(tenantId);
    const segunda = await backfillMensajesCampana(tenantId);

    expect(segunda.candidatos).toBe(0);
    expect(segunda.recuperados).toBe(0);
  });

  it('reporta lo que no es de campaña o cuya campaña ya no existe', async () => {
    const { tenantId, campaignId } = await sembrarEnvioVacio();
    await Campaign.deleteOne({ _id: campaignId });
    // Plantilla suelta (recordatorio, envío manual): nadie guardó con qué parámetros salió.
    await createScoped(Message, tenantId, {
      clienteId: new Types.ObjectId(),
      canal: 'whatsapp',
      direccion: 'outbound',
      sender: 'bot',
      tipo: 'plantilla',
      metaMessageId: 'wamid.SUELTA',
      status: 'sent',
    });

    const reporte = await backfillMensajesCampana(tenantId);

    expect(reporte.recuperados).toBe(0);
    expect(reporte.noRecuperables).toEqual({
      sin_campana: 1,
      campana_borrada: 1,
      plantilla_borrada: 0,
    });
  });

  it('AISLAMIENTO: el backfill de un tenant no toca ni lee los mensajes de otro', async () => {
    const a = await sembrarEnvioVacio();
    const b = await sembrarEnvioVacio();

    const reporteA = await backfillMensajesCampana(a.tenantId);

    expect(reporteA.candidatos).toBe(1);
    expect((await Message.findById(a.mensajeId).lean())?.texto).toBeDefined();
    expect((await Message.findById(b.mensajeId).lean())?.texto).toBeUndefined();
  });
});
