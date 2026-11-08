import type { Types } from 'mongoose';
import { findScoped } from '../../repositories/base.repository.js';
import { findTagsByIds } from '../tag/tag.service.js';
import { Campaign } from './campaign.model.js';
import { CampaignRecipient } from './campaign-recipient.model.js';
import type { EstadoDestinatario } from './campaign.types.js';

type TenantId = string | Types.ObjectId;

/** Tope de la ficha: es un historial para consultar, no un listado paginado. */
export const MAX_CAMPANAS_POR_CLIENTE = 20;

/**
 * Una campaña tal como la vivió UN contacto (HU-MARK-07): trazabilidad campaña ↔ cliente en la
 * ficha del lead.
 */
export interface ICampanaDeClienteResponse {
  id: string;
  nombre: string;
  /** Estado de SU envío, no el de la campaña: «fallido» aquí es que a esta persona no le llegó. */
  estado: EstadoDestinatario;
  enviadoAt: string | null;
  /**
   * La etiqueta que la campaña dejó en el contacto. `null` si la campaña no etiquetaba o si a esta
   * persona no le llegó (la etiqueta solo se pone a los envíos con éxito).
   */
  etiqueta: { id: string; nombre: string; color: string } | null;
}

interface IRecipientLean {
  campaignId: Types.ObjectId;
  estado: EstadoDestinatario;
  enviadoAt: Date | null;
  etiquetaAgregada?: boolean | null;
}

interface ICampaignLean {
  _id: Types.ObjectId;
  nombre: string;
  tagId?: Types.ObjectId | null;
}

/**
 * Las campañas que recibió un contacto, de la más reciente a la más antigua. Tres consultas para
 * todo el historial —destinatarios, campañas y etiquetas—, nunca una por fila. La de destinatarios
 * la cubre el índice `{ tenantId, clienteId, enviadoAt }`.
 */
export async function listCampanasDeCliente(
  tenantId: TenantId,
  clienteId: string | Types.ObjectId,
): Promise<ICampanaDeClienteResponse[]> {
  const recipients = await findScoped(CampaignRecipient, tenantId, { clienteId })
    .sort({ enviadoAt: -1, _id: -1 })
    .limit(MAX_CAMPANAS_POR_CLIENTE)
    .select({ campaignId: 1, estado: 1, enviadoAt: 1, etiquetaAgregada: 1 })
    .lean<IRecipientLean[]>();
  if (recipients.length === 0) return [];

  const campanas = await findScoped(Campaign, tenantId, {
    _id: { $in: recipients.map((r) => r.campaignId) },
  })
    .select({ nombre: 1, tagId: 1 })
    .lean<ICampaignLean[]>();
  const campanaMap = new Map(campanas.map((c) => [String(c._id), c]));

  const tagIds = campanas.flatMap((c) => (c.tagId ? [String(c.tagId)] : []));
  const tagMap = tagIds.length > 0 ? await findTagsByIds(tenantId, tagIds) : new Map();

  return recipients.flatMap((r) => {
    const campana = campanaMap.get(String(r.campaignId));
    if (!campana) return [];
    // Solo los envíos con éxito llevan etiqueta: un `failed` tardío la retira (y deja el destinatario
    // en `fallido`), y uno pendiente aún no la tiene.
    const llego = r.estado === 'enviado' || r.estado === 'entregado';
    const tag =
      campana.tagId && llego && r.etiquetaAgregada != null
        ? tagMap.get(String(campana.tagId))
        : undefined;
    return [
      {
        id: String(campana._id),
        nombre: campana.nombre,
        estado: r.estado,
        enviadoAt: r.enviadoAt ? r.enviadoAt.toISOString() : null,
        etiqueta: tag ? { id: tag.id, nombre: tag.nombre, color: tag.color } : null,
      },
    ];
  });
}
