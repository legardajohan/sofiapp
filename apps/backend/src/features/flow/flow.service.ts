import { Types } from 'mongoose';
import {
  countScoped,
  createScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findOneScoped,
  findScoped,
  updateManyScoped,
} from '../../repositories/base.repository.js';
import { analizarGrafo, nombreDeNodo, type ErrorGrafo } from '@sofiapp/shared';
import { AppError } from '../../utils/AppError.js';
import { Flow } from './flow.model.js';
import { getCamposPorKey } from '../contact-field/contact-field.service.js';
import { configNodoEstricto } from './flow.validation.js';
import type { ICliente } from '../cliente/cliente.types.js';
import type {
  CreateFlowDTO,
  IFlowLean,
  IFlowListItemResponse,
  IFlowResponse,
  IFlowSaveResponse,
  INodo,
  UpdateFlowDTO,
} from './flow.types.js';

type TenantId = string | Types.ObjectId;

function toFlowResponse(doc: IFlowLean): IFlowResponse {
  return {
    id: String(doc._id),
    nombre: doc.nombre,
    nodos: doc.nodos,
    aristas: doc.aristas,
    entrada: doc.entrada,
    trigger: doc.trigger ?? { tipo: 'siempre' },
    version: doc.version,
    estado: doc.estado,
    activo: doc.activo,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toFlowListItemResponse(doc: IFlowLean): IFlowListItemResponse {
  return {
    id: String(doc._id),
    nombre: doc.nombre,
    version: doc.version,
    estado: doc.estado,
    activo: doc.activo,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** El índice parcial único `{ tenantId }` (`activo: true`) es la única defensa real contra dos
 *  activaciones concurrentes; este error de Mongo es su reflejo cuando la desactivación previa
 *  no alcanzó a aplicarse a tiempo. */
function esActivacionConcurrente(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export async function listFlows(tenantId: TenantId): Promise<IFlowListItemResponse[]> {
  const docs = await findScoped(Flow, tenantId, {})
    .sort({ updatedAt: -1 })
    .lean<IFlowLean[]>();
  return docs.map(toFlowListItemResponse);
}

export async function getFlowById(tenantId: TenantId, flowId: string): Promise<IFlowResponse> {
  const doc = await findByIdScoped(Flow, tenantId, flowId).lean<IFlowLean>();
  if (!doc) throw new AppError('Flujo no encontrado.', 404);
  return toFlowResponse(doc);
}

/** Trae el flujo `activo` del tenant, con `_id`, para el runtime. `null` si el tenant no tiene
 *  ninguno activo — el motor de flujos simplemente no interviene. */
export async function getActiveFlow(tenantId: TenantId): Promise<IFlowLean | null> {
  return findOneScoped(Flow, tenantId, { activo: true }).lean<IFlowLean | null>();
}

/**
 * Qué flujo corre para este cliente (HU-IA-08). Un cliente real siempre usa el flujo `activo` del
 * tenant. La conversación de prueba puede apuntar a otro (`pruebaFlowId`), activo o no, para probarlo
 * antes de publicarlo; si ese flujo se borró, cae al activo en vez de dejar la prueba sin flujo.
 */
export async function resolverFlujoPara(
  tenantId: TenantId,
  cliente: Pick<ICliente, 'esPrueba' | 'pruebaFlowId'>,
): Promise<IFlowLean | null> {
  if (cliente.esPrueba && cliente.pruebaFlowId) {
    const elegido = await findByIdScoped(Flow, tenantId, String(cliente.pruebaFlowId)).lean<IFlowLean | null>();
    if (elegido) return elegido;
  }
  return getActiveFlow(tenantId);
}

/** Desactiva el flujo `activo` anterior del tenant, si lo hay. Se llama SIEMPRE antes de crear o
 *  guardar un flujo con `activo: true`, en la misma operación lógica: el índice parcial único es
 *  la garantía dura, esto es lo que evita que la petición choque contra ella en el camino feliz. */
async function desactivarFlowActivo(tenantId: TenantId, exceptoId?: string): Promise<void> {
  const filtro: Record<string, unknown> = { activo: true };
  if (exceptoId) filtro['_id'] = { $ne: new Types.ObjectId(exceptoId) };
  await updateManyScoped(Flow, tenantId, filtro, { $set: { activo: false } });
}

/**
 * Red de seguridad al ACTIVAR: `analizarGrafo` ya cubre el contenido, pero el esquema estricto de
 * Zod es la exigencia original del guardado. Si alguna vez discrepan, gana la más estricta y el
 * flujo no se activa (el test de consistencia fija que no deberían discrepar).
 */
function assertConfigsEstrictas(nodos: INodo[]): void {
  const errores: ErrorGrafo[] = [];
  for (const nodo of nodos) {
    const r = configNodoEstricto.safeParse(nodo.config);
    if (!r.success) {
      errores.push({
        nodoId: nodo.id,
        codigo: 'CONTENIDO_INCOMPLETO',
        mensaje: r.error.issues[0]?.message ?? 'La configuración del nodo está incompleta.',
      });
    }
  }
  if (errores.length > 0) {
    throw new AppError('El flujo tiene nodos sin completar.', 400, { codigo: 'FLOW_CON_ERRORES', errores });
  }
}

/**
 * HU-FLOW-05. Deja canónica la config de cada `captura` con destino de ficha:
 *  - `contacto` → `campo` = el campo fijo y `tipoDato` texto;
 *  - `atributo` → la `key` debe existir y estar ACTIVA en el catálogo **del tenant del token**
 *    (si no, `400` indicando el nodo); `campo` = la `key` y `tipoDato` lo fija el catálogo.
 * Así una condición siempre lee `var:nombre` o `var:institucion`, nunca un sinónimo tecleado.
 * `saltarSiExiste` (true) y `sobrescribir` (false) quedan explícitos. Una `captura` sin destino, o con
 * `variable`, no se toca: los flujos anteriores siguen igual.
 */
async function canonizarCapturas(tenantId: TenantId, nodos: INodo[]): Promise<INodo[]> {
  const keys = nodos.flatMap((n) =>
    n.config.tipo === 'captura' && n.config.destino?.tipo === 'atributo' && n.config.destino.key
      ? [n.config.destino.key]
      : [],
  );
  const catalogo = await getCamposPorKey(tenantId, [...new Set(keys)]);

  return nodos.map((nodo) => {
    const config = nodo.config;
    if (config.tipo !== 'captura' || !config.destino || config.destino.tipo === 'variable') return nodo;

    const comunes = { saltarSiExiste: config.saltarSiExiste ?? true, sobrescribir: config.sobrescribir ?? false };
    if (config.destino.tipo === 'contacto') {
      return { ...nodo, config: { ...config, ...comunes, campo: config.destino.campo, tipoDato: 'texto' } };
    }
    // `key` vacía = borrador sin elegir campo todavía: se guarda y `analizarGrafo` lo reporta.
    if (!config.destino.key) return { ...nodo, config: { ...config, ...comunes } };

    const campo = catalogo.get(config.destino.key);
    if (!campo || !campo.activo) {
      throw new AppError(
        `El nodo «${nombreDeNodo(nodo)}» guarda en el campo «${config.destino.key}», que no existe en esta empresa o fue archivado.`,
        400,
        { codigo: 'FLOW_CAMPO_INVALIDO', nodoId: nodo.id },
      );
    }
    return { ...nodo, config: { ...config, ...comunes, campo: campo.key, tipoDato: campo.tipoDato } };
  });
}

function conSalidaDeGuardado(
  flow: IFlowResponse,
  advertencias: ErrorGrafo[],
  desactivado: boolean,
): IFlowSaveResponse {
  return { ...flow, advertencias, desactivado };
}

export async function createFlow(tenantId: TenantId, entrada: CreateFlowDTO): Promise<IFlowSaveResponse> {
  const dto: CreateFlowDTO = { ...entrada, nodos: await canonizarCapturas(tenantId, entrada.nodos) };
  const errores = analizarGrafo(dto.nodos, dto.aristas, dto.entrada);
  if (dto.activo) {
    // Activar exige un grafo sin errores de conexión ni de contenido. Se valida ANTES de tocar el
    // flujo activo actual: un rechazo no puede dejar a la empresa sin flujo.
    if (errores.length > 0) {
      throw new AppError('El flujo tiene conexiones o nodos sin completar.', 400, {
        codigo: 'FLOW_CON_ERRORES',
        errores,
      });
    }
    assertConfigsEstrictas(dto.nodos);
    await desactivarFlowActivo(tenantId);
  }

  try {
    const doc = await createScoped(Flow, tenantId, {
      nombre: dto.nombre,
      nodos: dto.nodos,
      aristas: dto.aristas,
      entrada: dto.entrada,
      trigger: dto.trigger ?? { tipo: 'siempre' },
      version: 1,
      estado: 'borrador',
      activo: dto.activo ?? false,
    });
    return conSalidaDeGuardado(toFlowResponse(doc.toObject() as unknown as IFlowLean), errores, false);
  } catch (err) {
    if (esActivacionConcurrente(err)) {
      throw new AppError('Ya hay otro flujo activándose para esta empresa. Intenta de nuevo.', 409);
    }
    throw err;
  }
}

export async function updateFlow(
  tenantId: TenantId,
  flowId: string,
  entrada: UpdateFlowDTO,
): Promise<IFlowSaveResponse> {
  const actual = await findByIdScoped(Flow, tenantId, flowId).lean<IFlowLean>();
  if (!actual) throw new AppError('Flujo no encontrado.', 404);
  const dto: UpdateFlowDTO = {
    ...entrada,
    ...(entrada.nodos !== undefined && { nodos: await canonizarCapturas(tenantId, entrada.nodos) }),
  };

  // El análisis es sobre el grafo RESULTANTE: lo que llega más lo que ya estaba guardado.
  const nodos = dto.nodos ?? actual.nodos;
  const errores = analizarGrafo(nodos, dto.aristas ?? actual.aristas, dto.entrada ?? actual.entrada);

  let activo = dto.activo;
  let desactivado = false;

  if (errores.length > 0) {
    if (dto.activo === true && !actual.activo) {
      // Intento de activar con errores.
      throw new AppError('El flujo tiene conexiones o nodos sin completar.', 400, {
        codigo: 'FLOW_CON_ERRORES',
        errores,
      });
    }
    if (actual.activo && dto.activo !== false) {
      // Editar un flujo en producción dejándolo con errores nunca ocurre en silencio: sin
      // confirmación explícita no se guarda nada; con ella se guarda y queda INACTIVO.
      if (!dto.confirmarDesactivar) {
        throw new AppError(
          'El flujo activo tiene errores. Si lo guardas así, quedará inactivo hasta que los corrijas.',
          409,
          { codigo: 'FLOW_ACTIVO_CON_ERRORES', errores },
        );
      }
      activo = false;
      desactivado = true;
    }
  } else if (dto.activo === true || (actual.activo && dto.activo === undefined)) {
    assertConfigsEstrictas(nodos);
  }

  if (activo === true) await desactivarFlowActivo(tenantId, flowId);

  try {
    const actualizado = await findOneAndUpdateScoped(
      Flow,
      tenantId,
      { _id: new Types.ObjectId(flowId) },
      {
        $set: {
          ...(dto.nombre !== undefined && { nombre: dto.nombre }),
          ...(dto.nodos !== undefined && { nodos: dto.nodos }),
          ...(dto.aristas !== undefined && { aristas: dto.aristas }),
          ...(dto.entrada !== undefined && { entrada: dto.entrada }),
          ...(dto.trigger !== undefined && { trigger: dto.trigger }),
          ...(dto.estado !== undefined && { estado: dto.estado }),
          ...(activo !== undefined && { activo }),
        },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true },
    ).lean<IFlowLean>();
    if (!actualizado) throw new AppError('Flujo no encontrado.', 404);
    return conSalidaDeGuardado(toFlowResponse(actualizado), errores, desactivado);
  } catch (err) {
    if (esActivacionConcurrente(err)) {
      throw new AppError('Ya hay otro flujo activándose para esta empresa. Intenta de nuevo.', 409);
    }
    throw err;
  }
}

/**
 * Cuántos flujos del tenant nombran a un usuario en un nodo: efecto `asignar_asesor` o asesor a
 * notificar en un `handoff` (AUTH-03). Solo informa al gestor que lo va a desactivar; los flujos
 * no se editan solos — el runtime tolera un asesor inactivo.
 */
export async function countFlowsReferencingUser(tenantId: TenantId, userId: string): Promise<number> {
  return countScoped(Flow, tenantId, {
    $or: [{ 'nodos.config.efecto.asesorId': userId }, { 'nodos.config.notificarAsesorId': userId }],
  });
}
