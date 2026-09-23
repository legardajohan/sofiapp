import { Schema, model } from 'mongoose';
import { ESTADOS_DESTINATARIO } from './campaign.types.js';
import type { ICampaignRecipientDocument } from './campaign.types.js';

const CampaignRecipientSchema = new Schema<ICampaignRecipientDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
    // Copiado del contacto al materializar, no resuelto por `populate` en cada lote: es el número
    // al que se escribió, y si mañana se corrige la ficha, esta fila tiene que seguir diciendo a
    // dónde fue el mensaje.
    telefono: { type: String, required: true },
    estado: { type: String, enum: ESTADOS_DESTINATARIO, required: true, default: 'pendiente' },
    metaMessageId: { type: String, default: null },
    error: { type: String, default: null },
    enviadoAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// "Dame el próximo lote pendiente de esta campaña" — la consulta que el worker hace en bucle.
CampaignRecipientSchema.index({ tenantId: 1, campaignId: 1, estado: 1 });

// Un contacto, un envío por campaña. Este índice —y no la comprobación previa del service— es la
// única defensa real contra el doble envío: entre leer los pendientes y marcarlos cabe otro
// proceso. Mismo criterio que `{tenantId, telefono}` en `Lead`.
CampaignRecipientSchema.index({ tenantId: 1, campaignId: 1, clienteId: 1 }, { unique: true });

// Resolución de los `statuses` del webhook. `sparse` porque solo existe tras un envío aceptado, y
// **encabezado por `tenantId`** a propósito: HT-WA-01-V2 cerró una fuga donde el `metaMessageId` se
// resolvía sin tenant, y esa puerta no se vuelve a abrir aquí.
CampaignRecipientSchema.index({ tenantId: 1, metaMessageId: 1 }, { sparse: true });

export const CampaignRecipient = model<ICampaignRecipientDocument>(
  'CampaignRecipient',
  CampaignRecipientSchema,
  'campaign_recipients',
);
