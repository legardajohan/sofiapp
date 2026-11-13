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
import { listTenantUsers } from '../users/user.service.js';
import { DESTINO_POR_DEFECTO } from '@sofiapp/shared';
import { validarDestino } from '../users/user.grupos.js';
import {
  ESTADOS_ACTIVOS,
  destinoDesdeLegado,
  idsEnLinea,
  legadoDesdeDestino,
  resolverDestinoAsignacion,
} from '../users/user.destino.js';
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
    destino: structuredClone(DESTINO_POR_DEFECTO),
    mensajeTransicion: MENSAJE_HANDOFF,
    condicionesExtras: [],
    // Copia profunda: sin esto, dos tenants sin configuración compartirían el mismo array de frases
    // y una mutación accidental en un request afectaría al siguiente.
    reglas: structuredClone(REGLAS_DE_FABRICA),
    heredado: true,
  };
}

function toDTO(doc: IHandoffSettings): HandoffSettingsDTO {
  const asesorDestinoId = doc.asesorDestinoId ? String(doc.asesorDestinoId) : null;
  // HU-IA-07: los documentos guardados antes no traen el campo. Derivarlo aquí es lo que evita un
  // script de migración, y lo que garantiza que un tenant que no abra esta pantalla se comporte
  // exactamente igual que antes.
  const estrategiaDestino = doc.estrategiaDestino ?? (asesorDestinoId ? 'fijo' : 'primero');
  return {
    activo: doc.activo,
    asesorDestinoId,
    estrategiaDestino,
    // AUTH-06: misma idea, un nivel más: sin `destino`, se traduce del formato viejo.
    destino: doc.destino ?? destinoDesdeLegado(estrategiaDestino, asesorDestinoId),
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
  // AUTH-06: `destino` manda; un cliente viejo que aún manda el formato anterior se traduce.
  const destino = dto.destino ?? destinoDesdeLegado(dto.estrategiaDestino, dto.asesorDestinoId ?? null);
  // Va ANTES de escribir: el usuario y los coordinadores del destino llegan del cuerpo de la petición
  // y son el único punto por el que un usuario de otro tenant podría colarse. Si alguno no es válido
  // en esta empresa, la operación falla entera (404) y no se escribe nada.
  await validarDestino(tenantId, destino);
  // Se escribe también el formato viejo durante un release, para poder volver atrás sin perderlo.
  const legado = legadoDesdeDestino(destino);

  const guardada = await findOneAndUpdateScoped(
    HandoffSettings,
    tenantId,
    {},
    {
      $set: {
        activo: dto.activo,
        destino,
        asesorDestinoId: legado.asesorDestinoId ? new Types.ObjectId(legado.asesorDestinoId) : null,
        estrategiaDestino: legado.estrategiaDestino,
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
 * Primer usuario activo del tenant por nombre. AUTH-06: envoltorio sobre el resolvedor único
 * (`resolverDestinoAsignacion` con el grupo «todos»), que es quien decide de verdad.
 */
export async function primerAdminActivo(tenantId: string): Promise<string | null> {
  return resolverDestinoAsignacion(tenantId, { ...DESTINO_POR_DEFECTO, reserva: { tipo: 'sin_asignar' } });
}

// ─── Reparto por carga y métricas por asesor (HU-IA-07) ─────────────────────────

/** Una sola definición de «carga viva» para el reparto y el panel: vive en `user.destino` (AUTH-06). */
export { ESTADOS_ACTIVOS };

interface EstadoFila {
  _id: { asesorId: Types.ObjectId | null; estadoComercial: string };
  total: number;
}

/**
 * Usuario activo con menos conversaciones activas de toda la empresa; empate → el primero por nombre.
 * AUTH-06: envoltorio sobre el resolvedor único con el grupo «todos».
 */
export async function asesorConMenorCarga(tenantId: string): Promise<string | null> {
  return resolverDestinoAsignacion(tenantId, {
    modo: 'grupo',
    grupo: { tipo: 'todos' },
    criterio: 'menor_carga',
    soloEnLinea: false,
    reserva: { tipo: 'sin_asignar' },
  });
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
  // AUTH-06: quién está en línea, con la misma definición que el filtro «solo en línea» del reparto.
  const enLinea = await idsEnLinea(tenantId, admins.map((a) => a.id));

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
      rolEmpresa: admin.rolEmpresa ?? null,
      coordinadorId: admin.coordinadorId,
      esPrincipal: admin.esPrincipal === true,
      enLinea: enLinea.has(admin.id),
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
  esPrueba: boolean,
): Promise<boolean> {
  try {
    const { data } = await getAIService().classify({
      tenantId: new Types.ObjectId(tenantId),
      historial,
      esPrueba,
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
  /** HU-IA-08: la evaluación nace de la conversación de prueba; etiqueta el consumo de IA. */
  esPrueba = false,
): Promise<HandoffDecision> {
  if (!settings.activo) return NO_DISPARA;
  const { lowConfidence, intentPurchase } = settings.reglas;

  if (lowConfidence.activa && disparaBajaConfianza(lowConfidence, resultado)) {
    return { dispara: true, motivo: 'low_confidence' };
  }
  if (
    intentPurchase.activa &&
    (await disparaIntencionDeCompra(intentPurchase, tenantId, historial, esPrueba))
  ) {
    return { dispara: true, motivo: 'intent_purchase' };
  }
  return NO_DISPARA;
}
