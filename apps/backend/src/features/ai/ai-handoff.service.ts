import { Types } from 'mongoose';
import {
  aggregateScoped,
  findOneScoped,
  findOneAndUpdateScoped,
} from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { ESTADOS_COMERCIALES } from '../cliente/cliente.types.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { getAIService } from '../../services/ai/ai-service.singleton.js';
import type { AiResult } from '../../services/ai/ai-service.types.js';
import type { ChatTurn, NivelInteres } from '../../integrations/llm/llm-provider.types.js';
import { CHAT_FRASE_DERIVACION } from '../../seed/seed-prompt-templates.js';
import { assertAssignableAdmin, listTenantUsers } from '../users/user.service.js';
import { MENSAJE_HANDOFF } from '../../workers/ai-reply.messages.js';
import { HandoffSettings } from './ai-handoff.model.js';
import {
  NO_DISPARA,
  type AsesorMetricasDTO,
  type HandoffDecision,
  type HandoffSettingsDTO,
  type IHandoffReglas,
  type IHandoffSettings,
  type UpdateHandoffSettingsDTO,
} from './ai-handoff.types.js';

/**
 * Frases con las que un cliente pide hablar con una persona. Van de fábrica para que el disparador
 * sirva desde el primer día sin que el admin tenga que imaginarse cómo escribe su propia gente.
 *
 * Sin acentos y en minúsculas a propósito: la comparación normaliza ambos lados, así que escribirlas
 * ya normalizadas evita la duda de si "atención" y "atencion" son dos entradas distintas.
 */
export const FRASES_PETICION_EXPLICITA = [
  'hablar con una persona',
  'hablar con alguien',
  'hablar con un asesor',
  'hablar con un humano',
  'quiero un asesor',
  'necesito un asesor',
  'atencion al cliente',
  'me pueden llamar',
  'comunicarme con alguien',
];

/** Escala del clasificador, en orden. Se compara por posición, no por igualdad. */
const ORDEN_INTERES: readonly NivelInteres[] = ['frio', 'tibio', 'caliente'] as const;

const REGLAS_DE_FABRICA: IHandoffReglas = {
  explicitRequest: { activa: false, frases: FRASES_PETICION_EXPLICITA },
  keyword: { activa: false, palabras: [] },
  lowConfidence: { activa: false, umbral: null },
  intentPurchase: { activa: false, nivelMinimo: 'caliente' },
};

/**
 * Lo que ve un tenant que nunca ha guardado nada. Todo apagado: esta historia no puede cambiarle el
 * comportamiento a ninguna empresa que ya esté en producción hasta que un admin lo encienda.
 */
function settingsDeFabrica(): HandoffSettingsDTO {
  return {
    activo: false,
    asesorDestinoId: null,
    estrategiaDestino: 'primero',
    mensajeTransicion: MENSAJE_HANDOFF,
    condicionesExtras: [],
    // Copia profunda: sin esto, dos tenants sin configuración compartirían el mismo array de frases
    // y una mutación accidental en un request afectaría al siguiente.
    reglas: structuredClone(REGLAS_DE_FABRICA),
    heredado: true,
  };
}

function toDTO(doc: IHandoffSettings): HandoffSettingsDTO {
  return {
    activo: doc.activo,
    asesorDestinoId: doc.asesorDestinoId ? String(doc.asesorDestinoId) : null,
    // HU-IA-07: los documentos guardados antes no traen el campo. Derivarlo aquí es lo que evita un
    // script de migración, y lo que garantiza que un tenant que no abra esta pantalla se comporte
    // exactamente igual que antes.
    estrategiaDestino: doc.estrategiaDestino ?? (doc.asesorDestinoId ? 'fijo' : 'primero'),
    mensajeTransicion: doc.mensajeTransicion,
    reglas: doc.reglas,
    condicionesExtras: doc.condicionesExtras ?? [],
    heredado: false,
  };
}

/**
 * Configuración vigente del tenant, o los valores de fábrica si todavía no ha guardado ninguna.
 *
 * **No lanza.** La llama el worker en cada auto-reply: si un fallo aquí propagara, una empresa sin
 * configuración de handoff se quedaría sin respuestas automáticas, que es infinitamente peor que
 * quedarse sin handoff.
 */
export async function getHandoffSettings(tenantId: string): Promise<HandoffSettingsDTO> {
  const doc = await findOneScoped(HandoffSettings, tenantId, {})
    .lean<IHandoffSettings>()
    .exec();
  return doc ? toDTO(doc) : settingsDeFabrica();
}

/**
 * Crea o actualiza la configuración del tenant. El filtro del `findOneAndUpdateScoped` lleva el
 * `tenantId` del token, así que el upsert solo puede alcanzar (o crear) el documento de esa empresa.
 */
export async function updateHandoffSettings(
  tenantId: string,
  dto: UpdateHandoffSettingsDTO,
): Promise<HandoffSettingsDTO> {
  // Va ANTES de escribir: `asesorDestinoId` llega del cuerpo de la petición y es el único punto por
  // el que un usuario de otro tenant podría colarse. Si no es un admin activo de esta empresa, la
  // operación falla entera y no se escribe nada.
  if (dto.asesorDestinoId) await assertAssignableAdmin(tenantId, dto.asesorDestinoId);

  const guardada = await findOneAndUpdateScoped(
    HandoffSettings,
    tenantId,
    {},
    {
      $set: {
        activo: dto.activo,
        asesorDestinoId: dto.asesorDestinoId ? new Types.ObjectId(dto.asesorDestinoId) : null,
        estrategiaDestino: dto.estrategiaDestino,
        mensajeTransicion: dto.mensajeTransicion,
        reglas: dto.reglas,
        condicionesExtras: dto.condicionesExtras,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean<IHandoffSettings>();

  if (!guardada) throw new AppError('No se pudo guardar la configuración de transferencia.', 500);
  return toDTO(guardada);
}

/**
 * Primer admin activo del tenant, como destino de reserva cuando no hay ninguno configurado.
 *
 * "El primero disponible" no puede significar otra cosa hoy: no existe presencia ni carga por
 * asesor. `listTenantUsers` ordena por nombre, así que el reparto es estable y predecible en vez de
 * arbitrario — que es lo que hace falta para poder explicarle a alguien por qué le llegó a él.
 */
export async function primerAdminActivo(tenantId: string): Promise<string | null> {
  const admins = await listTenantUsers(tenantId, { rol: 'admin', activo: true });
  return admins[0]?.id ?? null;
}

// ─── Reparto por carga y métricas por asesor (HU-IA-07) ─────────────────────────

/**
 * Estados que cuentan como carga viva. `pagado` y `perdido` son cierres (`docs/domain.md` §3).
 *
 * **Una sola definición** para el reparto automático y para el panel de asignación: si divergieran,
 * el modal enseñaría un número distinto del que decide a quién le llega la conversación.
 */
export const ESTADOS_ACTIVOS = ['nuevo', 'en_gestion', 'pago_pendiente'] as const;

interface CargaFila {
  _id: Types.ObjectId | null;
  activas: number;
}

interface EstadoFila {
  _id: { asesorId: Types.ObjectId | null; estadoComercial: string };
  total: number;
}

/**
 * Conversaciones activas por asesor, en UNA consulta. La clave del mapa es el id del asesor.
 *
 * Se apoya en los índices `{ tenantId, asesorId }` y `{ tenantId, estadoComercial }` que ya existen:
 * esta historia no añade ninguno.
 */
async function cargaPorAsesor(tenantId: string): Promise<Map<string, number>> {
  const filas = await aggregateScoped<CargaFila>(Cliente, tenantId, [
    { $match: { asesorId: { $ne: null }, estadoComercial: { $in: [...ESTADOS_ACTIVOS] } } },
    { $group: { _id: '$asesorId', activas: { $sum: 1 } } },
  ]).exec();

  return new Map(filas.map((f) => [String(f._id), f.activas]));
}

/**
 * Admin activo con menos conversaciones activas (HU-IA-07).
 *
 * **Empate → el primero por nombre.** El reparto tiene que poder explicársele a quien pregunte por
 * qué le llegó a él, y un desempate aleatorio no se puede explicar. `listTenantUsers` ya devuelve la
 * lista ordenada por nombre, así que basta recorrerla en orden y quedarse con el primero que mejore
 * el mínimo.
 *
 * Un admin sin ninguna conversación cuenta 0 y por tanto gana: es exactamente a quien queremos
 * mandarle la siguiente.
 */
export async function asesorConMenorCarga(tenantId: string): Promise<string | null> {
  const [admins, carga] = await Promise.all([
    listTenantUsers(tenantId, { rol: 'admin', activo: true }),
    cargaPorAsesor(tenantId),
  ]);

  const primero = admins[0];
  if (!primero) return null;

  let elegido = primero;
  let minimo = carga.get(primero.id) ?? 0;
  for (const admin of admins.slice(1)) {
    const activas = carga.get(admin.id) ?? 0;
    // `<` y no `<=`: ante un empate gana el que ya estaba, que es el primero por nombre.
    if (activas < minimo) {
      elegido = admin;
      minimo = activas;
    }
  }
  return elegido.id;
}

/**
 * Cómo está repartido el trabajo, por asesor (HU-IA-07).
 *
 * Se parte de los admins **activos** y se rellena desde el agregado, no al revés: un asesor sin nada
 * asignado cuenta 0 y aparece igual — es justo el que hay que ver. Un usuario desactivado no puede
 * recibir conversaciones, así que listarlo sería ofrecer un destino imposible.
 */
export async function metricasPorAsesor(tenantId: string): Promise<AsesorMetricasDTO[]> {
  const [admins, filas] = await Promise.all([
    listTenantUsers(tenantId, { rol: 'admin', activo: true }),
    aggregateScoped<EstadoFila>(Cliente, tenantId, [
      { $match: { asesorId: { $ne: null } } },
      {
        $group: {
          _id: { asesorId: '$asesorId', estadoComercial: '$estadoComercial' },
          total: { $sum: 1 },
        },
      },
    ]).exec(),
  ]);

  const porAsesor = new Map<string, Record<string, number>>();
  for (const fila of filas) {
    const id = String(fila._id.asesorId);
    const actual = porAsesor.get(id) ?? {};
    actual[fila._id.estadoComercial] = fila.total;
    porAsesor.set(id, actual);
  }

  return admins.map((admin) => {
    const conteos = porAsesor.get(admin.id) ?? {};
    // Los cinco estados siempre presentes: que la UI no tenga que distinguir «cero» de «ausente».
    const porEstado: Record<string, number> = {};
    for (const estado of ESTADOS_COMERCIALES) porEstado[estado] = conteos[estado] ?? 0;

    return {
      asesorId: admin.id,
      nombre: admin.nombre,
      activas: ESTADOS_ACTIVOS.reduce((suma, e) => suma + (porEstado[e] ?? 0), 0),
      porEstado,
    };
  });
}

// ─── Motor de evaluación ────────────────────────────────────────────────────────

/** Minúsculas y sin diacríticos, para que "asesoría" y "asesoria" comparen igual. */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function escaparRegExp(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Coincidencia por **palabra completa**, no por subcadena.
 *
 * Con un `includes` a secas la palabra clave "asesor" dispararía dentro de "asesoría",
 * "asesorarme" o "asesoramiento": el admin escribió una palabra, no un prefijo, y un handoff que
 * salta cuando no debe ocupa a una persona para nada. El límite se pone en los extremos del
 * término, así que las frases de varias palabras siguen funcionando enteras.
 */
function contieneTermino(textoNormalizado: string, termino: string): boolean {
  const t = normalizar(termino).trim();
  if (!t) return false;
  const limite = '[^\\p{L}\\p{N}]';
  return new RegExp(`(?:^|${limite})${escaparRegExp(t)}(?:${limite}|$)`, 'u').test(
    textoNormalizado,
  );
}

function algunTermino(texto: string, terminos: string[]): boolean {
  const normalizado = normalizar(texto);
  return terminos.some((t) => contieneTermino(normalizado, t));
}

/**
 * Disparadores que se deciden con lo que escribió el cliente, **sin llamar al modelo**.
 *
 * Función pura: sin Mongo, sin Redis, sin LLM. Se evalúa antes de generar porque si la conversación
 * se va a una persona, pagar un embedding y una generación para tirar la respuesta es gasto y
 * latencia puros — y la latencia la percibe el cliente que ya pidió hablar con alguien.
 */
export function evaluarAntesDeGenerar(
  settings: HandoffSettingsDTO,
  ultimoMensajeCliente: string,
): HandoffDecision {
  if (!settings.activo) return NO_DISPARA;
  const { explicitRequest, keyword } = settings.reglas;

  if (explicitRequest.activa && algunTermino(ultimoMensajeCliente, explicitRequest.frases)) {
    return { dispara: true, motivo: 'explicit_request' };
  }
  if (keyword.activa && algunTermino(ultimoMensajeCliente, keyword.palabras)) {
    return { dispara: true, motivo: 'keyword' };
  }

  // Las condiciones del admin (HU-IA-07), en el orden del array — que es el que él ve en pantalla.
  //
  // Van DESPUÉS de las dos de fábrica porque la prioridad entre las de fábrica la fija el producto
  // (ver la cabecera de `MOTIVOS_HANDOFF`), y ANTES de `lowConfidence`/`intentPurchase` por el mismo
  // motivo que ya pone `keyword` delante: son gratis, no llaman al modelo, y si la conversación se
  // va a una persona, pagar una generación para tirarla es gasto y latencia puros.
  //
  // `algunTermino` es la MISMA función que usan las de fábrica, no una copia: duplicarla dejaría que
  // las condiciones del admin se comportaran distinto ante «asesoría» vs «asesor».
  for (const condicion of settings.condicionesExtras) {
    if (!condicion.activa) continue;
    if (algunTermino(ultimoMensajeCliente, condicion.palabras)) {
      return {
        dispara: true,
        motivo: 'custom',
        condicion: { key: condicion.key, nombre: condicion.nombre },
      };
    }
  }

  return NO_DISPARA;
}

/**
 * Baja confianza REAL. Tres guardas, y cada una tapa un falso positivo verificado:
 *
 *  - `cacheHit`: la respuesta salió de Redis y `retrievedChunks` viene vacío por construcción. La
 *    respuesta es buena; simplemente no se recuperó nada esta vez.
 *  - `fromFaq`: cortocircuito por FAQ, también con fragmentos vacíos. Es la respuesta que escribió
 *    el propio admin: lo contrario de baja confianza.
 *  - la frase de derivación: desde HU-IA-02 la plantilla `chat` responde un "gracias" o un "ok" con
 *    naturalidad, sin contexto y SIN derivar a nadie. Ese caso también llega con cero fragmentos,
 *    así que sin esta comprobación transferiríamos a un asesor a quien solo dio las gracias — que
 *    es exactamente el error que HU-IA-02 acaba de corregir en el prompt.
 */
function disparaBajaConfianza(
  regla: IHandoffReglas['lowConfidence'],
  resultado: AiResult<string>,
): boolean {
  if (resultado.cacheHit || resultado.fromFaq) return false;

  const fragmentos = resultado.retrievedChunks ?? [];
  if (fragmentos.length === 0) {
    return normalizar(resultado.data).includes(normalizar(CHAT_FRASE_DERIVACION));
  }

  // Vía estricta y opcional: solo puede exigir más que `KB_MIN_SCORE`, que ya filtró lo demás.
  if (regla.umbral === null) return false;
  const mejor = Math.max(...fragmentos.map((c) => c.score ?? 0));
  return mejor < regla.umbral;
}

async function disparaIntencionDeCompra(
  regla: IHandoffReglas['intentPurchase'],
  tenantId: string,
  historial: ChatTurn[],
): Promise<boolean> {
  try {
    const { data } = await getAIService().classify({
      tenantId: new Types.ObjectId(tenantId),
      historial,
    });
    return ORDEN_INTERES.indexOf(data.nivelInteres) >= ORDEN_INTERES.indexOf(regla.nivelMinimo);
  } catch (err: unknown) {
    // No se propaga: la respuesta ya está generada y tiene que salir. Un fallo del clasificador
    // puede costar un handoff, pero propagarlo costaría la respuesta entera.
    logger.warn('Handoff: falló la clasificación de intención', {
      tenantId,
      error: String(err),
    });
    return false;
  }
}

/**
 * Disparadores que necesitan la respuesta ya generada.
 *
 * `lowConfidence` va primero porque es gratis —usa el `AiResult` que ya está en mano—, y
 * `intentPurchase` después porque cuesta una llamada extra al modelo por mensaje: solo se paga si
 * está activo y nada anterior disparó. Está cacheada 2 h por historial, así que un reintento no la
 * vuelve a pagar, pero una conversación viva sí.
 */
export async function evaluarDespuesDeGenerar(
  settings: HandoffSettingsDTO,
  tenantId: string,
  historial: ChatTurn[],
  resultado: AiResult<string>,
): Promise<HandoffDecision> {
  if (!settings.activo) return NO_DISPARA;
  const { lowConfidence, intentPurchase } = settings.reglas;

  if (lowConfidence.activa && disparaBajaConfianza(lowConfidence, resultado)) {
    return { dispara: true, motivo: 'low_confidence' };
  }
  if (
    intentPurchase.activa &&
    (await disparaIntencionDeCompra(intentPurchase, tenantId, historial))
  ) {
    return { dispara: true, motivo: 'intent_purchase' };
  }
  return NO_DISPARA;
}
