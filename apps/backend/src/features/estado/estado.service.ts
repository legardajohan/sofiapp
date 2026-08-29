import type { Types } from 'mongoose';
import { countScoped, createScoped, findScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { Lead } from '../lead/lead.model.js';
import { Estado } from './estado.model.js';
import {
  COLOR_ESTADO_DEFECTO,
  type CreateEstadoDTO,
  type IEstado,
  type IEstadoResponse,
} from './estado.types.js';

/** Igual que en el resto de services: `base.repository` la declara pero no la exporta. */
type TenantId = string | Types.ObjectId;

type IEstadoLean = IEstado & { _id: { toString(): string } };

function toResponse(doc: IEstadoLean): IEstadoResponse {
  return {
    id: doc._id.toString(),
    key: doc.key,
    label: doc.label,
    color: doc.color || COLOR_ESTADO_DEFECTO,
    orden: doc.orden,
    activo: doc.activo,
    esDefecto: doc.esDefecto,
  };
}

/** Mismo slug que el catálogo de la ficha del contacto: estable, sin acentos y acotado a 40. */
function slugDeLabel(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'estado'
  );
}

/** Desempate numérico respetando el límite de 40 caracteres del schema. */
function desambiguar(base: string, usadas: Set<string>): string {
  if (!usadas.has(base)) return base;
  const raiz = base.slice(0, 36);
  let n = 2;
  while (usadas.has(`${raiz}-${n}`)) n += 1;
  return `${raiz}-${n}`;
}

/** El índice único `{ tenantId, key }` es la última defensa contra dos altas simultáneas. */
function esKeyDuplicada(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/**
 * El catálogo completo del tenant, en orden de pipeline. Incluye los archivados: la tabla necesita
 * resolver el `label` de un lead cuyo estado ya no se ofrece, y esconderlo dejaría la clave cruda.
 */
export async function listEstados(tenantId: TenantId): Promise<IEstadoResponse[]> {
  const docs = await findScoped(Estado, tenantId, {}).sort({ orden: 1 }).lean<IEstadoLean[]>();

  return docs.map(toResponse);
}

/**
 * Alta de un estado propio. El `key` se deriva del `label` y se desambigua contra los que ya
 * existen —incluidos los archivados—, porque es lo que queda grabado en `Lead.estado`.
 *
 * El `orden` va al final del pipeline: un estado nuevo no puede colarse entre "pagado" y "perdido"
 * sin que alguien lo decida.
 */
export async function createEstado(
  tenantId: TenantId,
  dto: CreateEstadoDTO,
): Promise<IEstadoResponse> {
  const existentes = await findScoped(Estado, tenantId, {})
    .select({ key: 1, label: 1, orden: 1 })
    .lean<{ key: string; label: string; orden: number }[]>();

  // Choque por nombre visible, que es lo que el administrador ve: dos "Visita agendada" en el
  // desplegable son indistinguibles aunque sus claves difieran.
  const label = dto.label.trim();
  if (existentes.some((e) => e.label.localeCompare(label, 'es', { sensitivity: 'base' }) === 0)) {
    throw new AppError('Ya existe un estado con ese nombre.', 409);
  }

  const key = desambiguar(slugDeLabel(label), new Set(existentes.map((e) => e.key)));
  const orden = existentes.reduce((max, e) => Math.max(max, e.orden), -1) + 1;

  try {
    const creado = await createScoped(Estado, tenantId, {
      key,
      label,
      color: dto.color ?? COLOR_ESTADO_DEFECTO,
      orden,
      activo: true,
      esDefecto: false,
    });

    return toResponse(creado as unknown as IEstadoLean);
  } catch (err) {
    if (esKeyDuplicada(err)) throw new AppError('Ya existe un estado con ese nombre.', 409);
    throw err;
  }
}

/**
 * Valida que un `key` pertenezca al catálogo del tenant. La usa el listado de leads antes de
 * filtrar: sin esto, `?estado=` con una clave de otra empresa filtraría por un valor que este
 * tenant no tiene y devolvería una página vacía sin explicar por qué.
 */
export async function existeEstado(tenantId: TenantId, key: string): Promise<boolean> {
  return (await countScoped(Estado, tenantId, { key })) > 0;
}

/** Cuántos leads del tenant llevan grabado ese estado. Para no archivar a ciegas. */
export async function contarLeadsConEstado(tenantId: TenantId, key: string): Promise<number> {
  return countScoped(Lead, tenantId, { estado: key });
}
