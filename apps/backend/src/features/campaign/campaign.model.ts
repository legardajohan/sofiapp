import { Schema, model } from 'mongoose';
import { MESSAGING_TIERS, QUALITY_RATINGS } from '../channel/channel.types.js';
import { COMBINACIONES_SEGMENTO, ESTADOS_CAMPANA, MIMES_IMAGEN_CAMPANA } from './campaign.types.js';
import type { ICampaignDocument } from './campaign.types.js';

/**
 * Filtros del segmento. `_id: false` como el resto de subdocumentos del proyecto.
 *
 * **Sin `enum`** en `rolContacto`, `semaforoLead`, `nivelInteres` ni en la `key` de los atributos:
 * los cuatro son catálogos por tenant (`contact_options`, `semaforos`) o datos que la empresa
 * inventa, no estructura. Quien decide si una clave tiene sentido es el segmentador, y su respuesta
 * es "no hay nadie con esa clave", no un error de validación (criterio 2 del spec).
 */
const FiltroAtributoSchema = new Schema(
  {
    key: { type: String, required: true },
    valores: { type: [String], required: true, default: [] },
  },
  { _id: false },
);

const FiltrosSchema = new Schema(
  {
    atributos: { type: [FiltroAtributoSchema], default: [] },
    rolContacto: { type: [String], default: [] },
    semaforoLead: { type: [String], default: [] },
    nivelInteres: { type: [String], default: [] },
    intencionCompra: { type: [String], default: [] },
    estadoComercial: { type: [String], default: [] },
    tagIds: { type: [Schema.Types.ObjectId], default: [] },
    // Constructor de audiencias. Sin `enum` en `etapas` por lo mismo que `semaforoLead`: catálogo
    // por tenant (`estados`). `combinacion` sí es estructura: solo hay dos formas de juntar ejes.
    etapas: { type: [String], default: [] },
    combinacion: { type: String, enum: COMBINACIONES_SEGMENTO, default: 'y' },
    excluirClienteIds: { type: [Schema.Types.ObjectId], default: [] },
  },
  { _id: false },
);

/**
 * Presupuesto congelado al lanzar. Es auditoría, no configuración: responde "¿por qué esta campaña
 * fue a esta velocidad?" meses después, cuando el tier del número ya es otro.
 */
const PresupuestoSchema = new Schema(
  {
    tier: { type: String, enum: MESSAGING_TIERS, required: true },
    calidad: { type: String, enum: QUALITY_RATINGS, required: true },
    limiteDiario: { type: Number, required: true },
    intervaloMs: { type: Number, required: true },
  },
  { _id: false },
);

const TotalesSchema = new Schema(
  {
    destinatarios: { type: Number, required: true, default: 0 },
    enviados: { type: Number, required: true, default: 0 },
    entregados: { type: Number, required: true, default: 0 },
    fallidos: { type: Number, required: true, default: 0 },
    omitidos: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const ImagenSchema = new Schema(
  {
    mediaKey: { type: String, required: true },
    mimeType: { type: String, enum: MIMES_IMAGEN_CAMPANA, required: true },
    tamanoBytes: { type: Number, required: true },
    metaMediaId: { type: String, default: null },
    subidaMetaAt: { type: Date, default: null },
  },
  { _id: false },
);

const ContenidoSchema = new Schema(
  { imagen: { type: ImagenSchema, default: null } },
  { _id: false },
);

const CampaignSchema = new Schema<ICampaignDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    filtros: { type: FiltrosSchema, required: true, default: () => ({}) },
    templateId: { type: Schema.Types.ObjectId, ref: 'WhatsAppTemplate', required: true },
    parametros: { type: [String], required: true, default: [] },
    // HU-MARK-03. Default con imagen nula: las campañas de solo texto de MARK-01 se leen igual.
    contenido: { type: ContenidoSchema, required: true, default: () => ({ imagen: null }) },
    estado: { type: String, enum: ESTADOS_CAMPANA, required: true, default: 'borrador' },
    programadaPara: { type: Date, default: null },
    totales: { type: TotalesSchema, required: true, default: () => ({}) },
    presupuesto: { type: PresupuestoSchema, default: null },
    creadaPor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    iniciadaAt: { type: Date, default: null },
    finalizadaAt: { type: Date, default: null },
    motivo: { type: String, default: null },
  },
  { timestamps: true },
);

// Listado, con el orden por defecto incorporado para que filtro y orden salgan del mismo índice.
CampaignSchema.index({ tenantId: 1, createdAt: -1 });
CampaignSchema.index({ tenantId: 1, estado: 1, createdAt: -1 });
// Resumen de métricas del período (HU-MARK-04): campañas iniciadas en un rango.
CampaignSchema.index({ tenantId: 1, iniciadaAt: -1 });

// Disparador de las campañas programadas. **No empieza por `tenantId`, y es deliberado**: el
// barrido es cross-tenant por naturaleza (una pasada para toda la plataforma), igual que el de
// recordatorios de HU-FLOW-02. Solo devuelve identificadores (`tenantId`, `_id`); a partir de ahí
// todo vuelve a pasar por `*Scoped`. Documentado como excepción en `docs/multi-tenancy.md` §5.
CampaignSchema.index({ estado: 1, programadaPara: 1 });

export const Campaign = model<ICampaignDocument>('Campaign', CampaignSchema, 'campaigns');
