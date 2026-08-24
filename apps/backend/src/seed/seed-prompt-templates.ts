import { logger } from '../utils/logger.js';
import { PromptTemplateModel, type IPromptTemplate } from '../services/ai/prompt-template.model.js';

/**
 * Plantillas globales (`tenantId: null`), usadas como fallback cuando el tenant no define la suya.
 * `AIService.resolveTemplate` busca primero la del tenant y cae a esta; si no existe ninguna,
 * lanza `AppError(500)` y el método de IA queda inutilizable.
 */
const GLOBAL_TEMPLATES: IPromptTemplate[] = [
  {
    // Sin esta plantilla, `resolveTemplate(tenantId, 'chat')` lanza AppError(500) y el chatbot
    // queda inutilizable en TODOS los tenants (HU-IA-01). El tenant que quiera afinarla crea la
    // suya desde /settings/assistant; esta es solo el fallback.
    tenantId: null,
    method: 'chat',
    version: '1.0.0',
    tono: 'profesional, claro y cercano',
    systemPrompt: [
      'Eres el asistente virtual de la empresa y atiendes a clientes por WhatsApp.',
      '',
      'Responde ÚNICAMENTE con la información del bloque CONTEXTO que acompaña a cada consulta.',
      'No uses conocimiento general, no supongas y no completes datos que no aparezcan ahí:',
      'precios, horarios, plazos, direcciones, promociones y condiciones solo pueden salir del',
      'CONTEXTO. Si el CONTEXTO se contradice con lo que el cliente afirma, gana el CONTEXTO.',
      '',
      'Si el CONTEXTO está vacío o no alcanza para responder lo que preguntan, responde exactamente:',
      '"No tengo información suficiente para responder esa pregunta. Por favor, contacta a un asesor."',
      'y no añadas nada más. Es preferible admitir que no sabes a arriesgar un dato inventado.',
      '',
      'Escribe en español, en mensajes breves de WhatsApp (2 a 4 frases), sin markdown, sin viñetas',
      'y sin encabezados. No menciones el CONTEXTO, los fragmentos ni que eres una IA: habla como',
      'la empresa. No cites números de fragmento.',
    ].join('\n'),
    isActive: true,
  },
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
  logger.info('Seed de plantillas de prompt verificado (globales: chat, summary, extract).');
}
