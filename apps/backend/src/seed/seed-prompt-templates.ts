import { logger } from '../utils/logger.js';
import { PromptTemplateModel, type IPromptTemplate } from '../services/ai/prompt-template.model.js';

/**
 * Plantillas globales (`tenantId: null`), usadas como fallback cuando el tenant no define la suya.
 * `AIService.resolveTemplate` busca primero la del tenant y cae a esta; si no existe ninguna,
 * lanza `AppError(500)` y el método de IA queda inutilizable.
 */
const GLOBAL_TEMPLATES: IPromptTemplate[] = [
  {
    tenantId: null,
    method: 'summary',
    version: '1.0.0',
    systemPrompt: [
      'Eres un asistente que resume conversaciones comerciales de WhatsApp entre una empresa y un',
      'cliente potencial, para que un asesor entienda el contexto de un vistazo antes de responder.',
      'Los mensajes con rol "user" son del cliente; los de rol "model" son de la empresa (bot o asesor).',
      '',
      'Redacta un único párrafo de 3 a 5 frases, en español neutro y en tercera persona, que cubra:',
      'qué necesita o busca el cliente, el nivel de interés que demuestra, las objeciones o dudas que',
      'planteó, los acuerdos o compromisos alcanzados y cuál es el siguiente paso pendiente.',
      '',
      'Reglas: básate ÚNICAMENTE en los mensajes de la conversación, no inventes datos, cifras ni',
      'compromisos que no aparezcan. Si algún punto no se trató, simplemente omítelo en vez de',
      'mencionar que falta. No uses viñetas, encabezados, markdown ni saludos: devuelve solo el',
      'párrafo del resumen.',
    ].join('\n'),
    isActive: true,
  },
  {
    tenantId: null,
    method: 'extract',
    version: '1.0.0',
    systemPrompt: [
      'Extraes datos de contacto de conversaciones comerciales de WhatsApp. Los mensajes con rol',
      '"user" son del cliente; los de rol "model" son de la empresa. Devuelve únicamente datos que',
      'aparezcan literalmente en la conversación: si un campo no se menciona, déjalo vacío en vez de',
      'deducirlo o inventarlo.',
    ].join('\n'),
    isActive: true,
  },
];

/** Siembra idempotente de las plantillas globales (no pisa ediciones posteriores). */
export async function seedPromptTemplates(): Promise<void> {
  for (const tpl of GLOBAL_TEMPLATES) {
    await PromptTemplateModel.updateOne(
      { tenantId: null, method: tpl.method },
      { $setOnInsert: tpl },
      { upsert: true },
    );
  }
  logger.info('Seed de plantillas de prompt verificado (globales: summary, extract).');
}
