import { logger } from '../utils/logger.js';
import { PromptTemplateModel, type IPromptTemplate } from '../services/ai/prompt-template.model.js';

/**
 * Plantillas globales (`tenantId: null`), usadas como fallback cuando el tenant no define la suya.
 * `AIService.resolveTemplate` busca primero la del tenant y cae a esta; si no existe ninguna,
 * lanza `AppError(500)` y el método de IA queda inutilizable.
 */
/**
 * Versión de la plantilla global `chat`. Se exporta porque `migrate-chat-template.ts` la necesita:
 * el seed usa `$setOnInsert` —para no pisar lo que un admin haya editado—, así que una global ya
 * sembrada NO se actualiza sola y hace falta una migración explícita.
 *
 * `1.1.0` (HU-IA-02) añadió la excepción para mensajes sociales.
 */
export const CHAT_TEMPLATE_VERSION = '1.1.0';

/**
 * La frase exacta con la que la plantilla `chat` admite que no puede responder.
 *
 * Se extrae aquí, en vez de quedarse escrita dentro del prompt, porque el disparador de baja
 * confianza de HU-IA-03 la usa como señal: es la única forma fiable de distinguir "no encontré la
 * respuesta" de "no hacía falta buscar nada" (un saludo, un "gracias"), ya que ambos casos llegan
 * con cero fragmentos recuperados. Duplicar el texto en el motor de handoff lo habría separado del
 * prompt a la primera edición.
 *
 * Al componerse dentro de `CHAT_SYSTEM_PROMPT`, el prompt resultante no cambia ni un carácter: por
 * eso `CHAT_TEMPLATE_VERSION` sigue en `1.1.0` y no hace falta migración.
 */
export const CHAT_FRASE_DERIVACION =
  'No tengo información suficiente para responder esa pregunta. Por favor, contacta a un asesor.';

/**
 * Versión de la plantilla global `classify`. Igual que la de `chat`, se exporta para que
 * `migrate-classify-template.ts` pueda actualizar las bases ya sembradas: `$setOnInsert` no lo hace.
 *
 * `2.0.0` (HU-IA-05) es un cambio de CONTRATO, no de redacción: el modelo pasa a devolver también
 * `confianza` y `motivo`. Por eso sube el major — y de paso invalida la caché de `classify`, cuya
 * clave incluye la versión de la plantilla, así que ninguna entrada vieja puede volver sin los
 * campos nuevos.
 *
 * Hasta HU-IA-05 este prompt no llegaba al modelo: `AIService.classify` resolvía la plantilla pero
 * `classifyLead` no aceptaba instrucciones. Era texto muerto; ahora sí gobierna la clasificación.
 */
export const CLASSIFY_TEMPLATE_VERSION = '2.0.0';

export const CLASSIFY_SYSTEM_PROMPT = [
  'Clasificas conversaciones comerciales de WhatsApp entre una empresa y un cliente potencial.',
  'Los mensajes con rol "user" son del cliente; los de rol "model" son de la empresa (bot o asesor).',
  '',
  'Devuelve el nivel de interés de compra que demuestra el CLIENTE:',
  '- "frio": pregunta por curiosidad o pide información general, sin señales de querer contratar.',
  '- "tibio": compara opciones, pide precios, plazos o condiciones, o muestra interés sin comprometerse.',
  '- "caliente": pide comprar, matricularse, pagar, reservar, agendar una cita o hablar con alguien',
  '  para cerrar. También cuando confirma que quiere avanzar.',
  '',
  'Devuelve además la objeción principal que haya planteado el cliente ("precio", "tiempo",',
  '"confianza" u "otra"), o null si no ha planteado ninguna.',
  '',
  'Clasifica ÚNICAMENTE con lo que aparece en la conversación: no supongas una intención que el',
  'cliente no haya expresado. Ante la duda entre dos niveles, elige el más bajo — sobreestimar el',
  'interés hace que un asesor deje lo que está haciendo para atender a quien solo preguntaba.',
  '',
  'CONFIANZA (número entre 0 y 1): qué tan seguro estás de tu propia clasificación.',
  '- Alta (0.8 a 1.0): el cliente lo dice explícitamente ("quiero pagar", "¿dónde me inscribo?").',
  '- Media (0.5 a 0.8): se deduce del contexto, pero el cliente no lo ha dicho con esas palabras.',
  '- Baja (menos de 0.5): la conversación tiene uno o dos mensajes, el cliente es ambiguo, o casi',
  '  todo el hilo lo escribió la empresa.',
  'Ante la duda, BÁJALA. Una confianza inflada mueve la clasificación de un cliente que después',
  'alguien tiene que corregir a mano.',
  '',
  'MOTIVO: una sola frase en español, en tercera persona, de menos de 200 caracteres, que explique',
  'QUÉ DIJO el cliente para merecer ese nivel. Ejemplo: "pide instrucciones de pago para',
  'matricularse". Describe la intención, no repitas el nivel.',
  'PROHIBIDO incluir en el motivo el nombre, el teléfono, el correo, el documento o cualquier otro',
  'dato de contacto del cliente: este texto queda registrado en una bitácora que pueden leer',
  'personas que no tienen permiso para ver esos datos.',
].join('\n');

/**
 * Versión de la plantilla global `extract`. Se exporta por el mismo motivo que las otras dos:
 * `$setOnInsert` no actualiza una global ya sembrada y hace falta `migrate-extract-template.ts`.
 *
 * `2.0.0` (HU-IA-06) es un cambio de CONTRATO: se pide un cuarto campo (`interes`). Y sobre todo,
 * es la primera versión que el modelo llega a leer — hasta HU-IA-06 `AIService.extract` resolvía la
 * plantilla y descartaba el resultado, así que este texto era letra muerta y el único criterio de
 * extracción eran las descripciones de los slots (`DATOS_CONTACTO_SLOTS`).
 */
export const EXTRACT_TEMPLATE_VERSION = '2.0.0';

export const EXTRACT_SYSTEM_PROMPT = [
  'Extraes datos de contacto de conversaciones comerciales de WhatsApp. Los mensajes con rol',
  '"user" son del cliente; los de rol "model" son de la empresa. Devuelve únicamente datos que',
  'aparezcan literalmente en la conversación: si un campo no se menciona, déjalo vacío en vez de',
  'deducirlo o inventarlo.',
  '',
  'El correo y el teléfono se copian TAL CUAL los escribió el cliente: no los reformatees, no les',
  'quites ni les añadas prefijos y no corrijas lo que parezca una errata.',
  '',
  'El campo "interes" es el producto, servicio, plan o programa CONCRETO que el cliente pide o por',
  'el que pregunta, con sus propias palabras y en una frase corta ("curso pre-ICFES sabatino",',
  '"apartamento de dos habitaciones en Laureles").',
  'NO es cuánto le interesa: "muy interesado", "caliente", "quiere comprar" o "le gustó" NO son',
  'respuestas válidas para ese campo; en esos casos déjalo vacío.',
  'Si menciona varios productos, devuelve el más reciente y específico: el que esté negociando.',
  '',
  'Si la conversación solo tiene saludos, agradecimientos o preguntas generales, los cuatro campos',
  'van vacíos. Un dato inventado cuesta más que un campo vacío: el asesor va a actuar sobre esto.',
].join('\n');

export const CHAT_SYSTEM_PROMPT = [
  'Eres el asistente virtual de la empresa y atiendes a clientes por WhatsApp.',
  '',
  'Responde ÚNICAMENTE con la información del bloque CONTEXTO que acompaña a cada consulta.',
  'No uses conocimiento general, no supongas y no completes datos que no aparezcan ahí:',
  'precios, horarios, plazos, direcciones, promociones y condiciones solo pueden salir del',
  'CONTEXTO. Si el CONTEXTO se contradice con lo que el cliente afirma, gana el CONTEXTO.',
  '',
  'Si el CONTEXTO está vacío o no alcanza para responder lo que preguntan, responde exactamente:',
  `"${CHAT_FRASE_DERIVACION}"`,
  'y no añadas nada más. Es preferible admitir que no sabes a arriesgar un dato inventado.',
  '',
  'EXCEPCIÓN a la regla anterior: si el mensaje no es una pregunta —un saludo, un agradecimiento,',
  'una despedida o una confirmación como "ok" o "listo"— responde con naturalidad y brevedad, sin',
  'usar esa frase y sin derivar a nadie. Mandar a un asesor a quien solo dijo "gracias" es un error',
  'tan grave como inventarse un dato: hace esperar al cliente y ocupa a una persona para nada.',
  '',
  'Escribe en español, en mensajes breves de WhatsApp (2 a 4 frases), sin markdown, sin viñetas',
  'y sin encabezados. No menciones el CONTEXTO, los fragmentos ni que eres una IA: habla como',
  'la empresa. No cites números de fragmento.',
].join('\n');

const GLOBAL_TEMPLATES: IPromptTemplate[] = [
  {
    // Sin esta plantilla, `resolveTemplate(tenantId, 'chat')` lanza AppError(500) y el chatbot
    // queda inutilizable en TODOS los tenants (HU-IA-01). El tenant que quiera afinarla crea la
    // suya desde /settings/assistant; esta es solo el fallback.
    tenantId: null,
    method: 'chat',
    version: CHAT_TEMPLATE_VERSION,
    tono: 'profesional, claro y cercano',
    systemPrompt: CHAT_SYSTEM_PROMPT,
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
    // Sin esta plantilla, `AIService.classify()` lanza AppError(500) en TODOS los tenants:
    // `resolveTemplate` exige una activa para el método y no había ninguna. Nadie lo llamaba en
    // producción, así que el fallo estaba latente hasta que HU-IA-03 apoyó en él el disparador de
    // intención de compra.
    tenantId: null,
    method: 'classify',
    version: CLASSIFY_TEMPLATE_VERSION,
    systemPrompt: CLASSIFY_SYSTEM_PROMPT,
    isActive: true,
  },
  {
    tenantId: null,
    method: 'extract',
    version: EXTRACT_TEMPLATE_VERSION,
    systemPrompt: EXTRACT_SYSTEM_PROMPT,
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
  logger.info(
    'Seed de plantillas de prompt verificado (globales: chat, summary, classify, extract).',
  );
}
