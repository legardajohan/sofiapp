import { Schema, model } from 'mongoose';
import type { IHandoffSettingsDocument } from './ai-handoff.types.js';

/**
 * Configuración de handoff de UN tenant (HU-IA-03). Es un documento por empresa, no una colección
 * de reglas sueltas: los disparadores son cuatro y fijos, así que una colección con CRUD habría
 * obligado a inventar un criterio de orden y a exponer endpoints que la historia no pide. El
 * índice único sobre `tenantId` es lo que lo garantiza.
 *
 * Se accede SIEMPRE por el repositorio scoped: la evaluación corre en el worker, y una fuga aquí
 * significaría aplicar las reglas de una empresa a las conversaciones de otra.
 */
const HandoffSettingsSchema = new Schema<IHandoffSettingsDocument>(
  {
    // Sin `index: true` aquí: el índice único de abajo ya lo cubre, y declararlo en los dos sitios
    // hace que Mongoose avise de índice duplicado en cada arranque.
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    activo: { type: Boolean, default: false },
    asesorDestinoId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // HU-IA-07. `default: 'primero'` y NINGÚN script de migración: para los documentos guardados
    // antes, `toDTO` la deriva de `asesorDestinoId`, así que un tenant que no abra esta pantalla se
    // comporta exactamente igual que antes.
    estrategiaDestino: {
      type: String,
      enum: ['primero', 'menor_carga', 'fijo'],
      default: 'primero',
    },
    mensajeTransicion: { type: String, required: true, trim: true },
    reglas: {
      explicitRequest: {
        activa: { type: Boolean, default: false },
        frases: { type: [String], default: [] },
      },
      keyword: {
        activa: { type: Boolean, default: false },
        palabras: { type: [String], default: [] },
      },
      lowConfidence: {
        activa: { type: Boolean, default: false },
        umbral: { type: Number, default: null },
      },
      intentPurchase: {
        activa: { type: Boolean, default: false },
        nivelMinimo: { type: String, enum: ['tibio', 'caliente'], default: 'caliente' },
      },
    },
    // Condiciones propias del admin (HU-IA-07). Van en ESTE documento y no en una colección: mismo
    // PUT, sin endpoints nuevos y sin criterio de orden que inventar — el orden es el del array,
    // que es el que ve quien lo configura.
    //
    // `_id: false` como en `semaforoIA` y `atributos`: la identidad es la `key`, y un `_id` de Mongo
    // sería un segundo identificador que nadie usa y que el DTO tendría que ocultar.
    condicionesExtras: {
      type: [
        new Schema(
          {
            key: { type: String, required: true },
            nombre: { type: String, required: true, trim: true },
            activa: { type: Boolean, default: true },
            palabras: { type: [String], default: [] },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true, collection: 'handoff_settings' },
);

// Único por tenant: es configuración, no una lista. Si algún día un upsert concurrente intentara
// crear un segundo documento, Mongo lo rechaza en vez de dejar dos configuraciones compitiendo.
HandoffSettingsSchema.index({ tenantId: 1 }, { unique: true });

export const HandoffSettings = model<IHandoffSettingsDocument>(
  'HandoffSettings',
  HandoffSettingsSchema,
);
