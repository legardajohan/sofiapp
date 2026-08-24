import { Schema, model, type Document, type Types } from 'mongoose';

export interface IPromptTemplate {
  // null = plantilla global (fallback cuando no existe una específica del tenant)
  tenantId: Types.ObjectId | null;
  method: 'chat' | 'extract' | 'classify' | 'summary';
  version: string;
  systemPrompt: string;
  /**
   * Tono de voz del asistente (HU-IA-01). Va SEPARADO de `systemPrompt` porque
   * `generateReply` compone `Tono: ${tono}. ${instrucciones}`: mezclarlos duplicaría el texto
   * dentro del system prompt y cobraría sus tokens dos veces (ver `ai.service.ts`, `summarize`).
   * Opcional y retrocompatible: `undefined` significa "usa el tono por defecto del código".
   */
  tono?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPromptTemplateDocument extends IPromptTemplate, Document {}

const PromptTemplateSchema = new Schema<IPromptTemplateDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    method: { type: String, enum: ['chat', 'extract', 'classify', 'summary'], required: true },
    version: { type: String, required: true },
    systemPrompt: { type: String, required: true },
    tono: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

PromptTemplateSchema.index({ tenantId: 1, method: 1, isActive: 1 });

export const PromptTemplateModel = model<IPromptTemplateDocument>(
  'PromptTemplate',
  PromptTemplateSchema,
);
