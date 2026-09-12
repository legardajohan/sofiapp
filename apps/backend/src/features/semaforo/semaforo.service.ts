import type { Types } from 'mongoose';
import {
  countScoped,
  createScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findOneScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { Lead } from '../lead/lead.model.js';
import { Semaforo } from './semaforo.model.js';
import {
  COLOR_SEMAFORO_DEFECTO,
  type CreateSemaforoDTO,
  type ISemaforo,
  type ISemaforoResponse,
  type UpdateSemaforoDTO,
} from './semaforo.types.js';

/** Igual que en el resto de services: `base.repository` la declara pero no la exporta. */
type TenantId = string | Types.ObjectId;

type ISemaforoLean = ISemaforo & { _id: { toString(): string } };

function toResponse(doc: ISemaforoLean): ISemaforoResponse {
  return {
    id: doc._id.toString(),
    key: doc.key,
    label: doc.label,
    color: doc.color || COLOR_SEMAFORO_DEFECTO,
    orden: doc.orden,
    activo: doc.activo,
    esDefecto: doc.esDefecto,
  };
}

/** Mismo slug que el resto de catálogos del tenant: estable, sin acentos y acotado a 40. */
function slugDeLabel(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'semaforo'
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
 * El catálogo completo del tenant, en orden. Incluye los archivados: la tabla necesita resolver el
 * `label` de un lead cuyo semáforo ya no se ofrece, y esconderlo dejaría la clave cruda a la vista.
 */
export async function listSemaforos(tenantId: TenantId): Promise<ISemaforoResponse[]> {
  const docs = await findScoped(Semaforo, tenantId, {}).sort({ orden: 1 }).lean<ISemaforoLean[]>();

  return docs.map(toResponse);
}

/**
 * `Map<key, ISemaforoResponse>` para hidratar una página de leads con **una** consulta, nunca una
 * por fila. Mismo patrón en lote que `findUsersByIds` y `findTagsByIds`.
 */
export async function mapaSemaforos(tenantId: TenantId): Promise<Map<string, ISemaforoResponse>> {
  const docs = await listSemaforos(tenantId);

  return new Map(docs.map((s) => [s.key, s]));
}

/**
 * Alta de un semáforo propio. El `key` se deriva del `label` y se desambigua contra los que ya
 * existen —incluidos los archivados—, porque es lo que queda grabado en `Lead.semaforo`.
 *
 * El `orden` va al final: un semáforo nuevo no puede colarse entre "potencial" y "venta concretada"
 * sin que alguien lo decida.
 */
export async function createSemaforo(
  tenantId: TenantId,
  dto: CreateSemaforoDTO,
): Promise<ISemaforoResponse> {
  const existentes = await findScoped(Semaforo, tenantId, {})
    .select({ key: 1, label: 1, orden: 1 })
    .lean<{ key: string; label: string; orden: number }[]>();

  // Choque por nombre visible, que es lo que el administrador ve: dos "Tibio" en el desplegable son
  // indistinguibles aunque sus claves difieran.
  const label = dto.label.trim();
  if (existentes.some((s) => s.label.localeCompare(label, 'es', { sensitivity: 'base' }) === 0)) {
    throw new AppError('Ya existe un semáforo con ese nombre.', 409);
  }

  const key = desambiguar(slugDeLabel(label), new Set(existentes.map((s) => s.key)));
  const orden = existentes.reduce((max, s) => Math.max(max, s.orden), -1) + 1;

  try {
    const creado = await createScoped(Semaforo, tenantId, {
      key,
      label,
      color: dto.color ?? COLOR_SEMAFORO_DEFECTO,
      orden,
      activo: true,
      esDefecto: false,
    });

    return toResponse(creado as unknown as ISemaforoLean);
  } catch (err) {
    if (esKeyDuplicada(err)) throw new AppError('Ya existe un semáforo con ese nombre.', 409);
    throw err;
  }
}

/**
 * Renombrar, recolorear o archivar un semáforo.
 *
 * Dos reglas que no son cosméticas:
 *
 * - Los **cuatro de fábrica no se archivan**. Su `key` es el contrato estable de `docs/domain.md`
 *   §5: es por él que la etiqueta de la conversación se sincroniza y que IA-05 y MARK-01 los
 *   resolverán. Renombrarlos y recolorearlos sí — cada empresa habla su idioma —, pero retirarlos
 *   dejaría a esos módulos sin destino. Se responde `409` explicando la alternativa.
 * - **No hay borrado, ni siquiera para los propios.** Los leads llevan la `key` grabada; borrarla
 *   dejaría filas mostrando una clave cruda. Archivar conserva la etiqueta y quita el semáforo de
 *   la lista de opciones, que es lo que el usuario quiere de verdad.
 */
export async function updateSemaforo(
  tenantId: TenantId,
  semaforoId: string,
  dto: UpdateSemaforoDTO,
): Promise<ISemaforoResponse> {
  // Mismo criterio que el resto del CRM: un id de otro tenant es indistinguible de uno inexistente.
  // Un 403 aquí confirmaría que el semáforo existe en otra empresa.
  const actual = await findByIdScoped(Semaforo, tenantId, semaforoId).lean<ISemaforoLean>();
  if (!actual) throw new AppError('Semáforo no encontrado.', 404);

  if (dto.activo === false && actual.esDefecto) {
    throw new AppError(
      'Los cuatro semáforos base no se pueden archivar. Puedes renombrarlos o cambiarles el color.',
      409,
    );
  }

  if (dto.label !== undefined) {
    const label = dto.label.trim();
    const otros = await findScoped(Semaforo, tenantId, {})
      .select({ label: 1 })
      .lean<{ _id: Types.ObjectId; label: string }[]>();

    const choca = otros.some(
      (s) =>
        s._id.toString() !== actual._id.toString() &&
        s.label.localeCompare(label, 'es', { sensitivity: 'base' }) === 0,
    );
    if (choca) throw new AppError('Ya existe un semáforo con ese nombre.', 409);
  }

  // Solo lo que vino: un `undefined` en el `$set` de Mongoose borraría el campo.
  const cambios: Partial<ISemaforo> = {};
  if (dto.label !== undefined) cambios.label = dto.label.trim();
  if (dto.color !== undefined) cambios.color = dto.color;
  if (dto.activo !== undefined) cambios.activo = dto.activo;

  const actualizado = await findOneAndUpdateScoped(
    Semaforo,
    tenantId,
    { _id: actual._id },
    { $set: cambios },
    { new: true },
  ).lean<ISemaforoLean>();

  // El `findByIdScoped` de arriba ya probó que existe; si desapareció es una carrera con otro
  // borrado y el 404 sigue siendo la respuesta correcta.
  if (!actualizado) throw new AppError('Semáforo no encontrado.', 404);

  return toResponse(actualizado);
}

/**
 * Un semáforo por su `key`, ya resuelto. Para las rutas de **un solo lead**, donde traerse el
 * catálogo entero solo para pintar una etiqueta sería desproporcionado; el listado usa
 * `mapaSemaforos`, que resuelve la página completa con una consulta.
 */
export async function findSemaforoByKey(
  tenantId: TenantId,
  key: string | null,
): Promise<ISemaforoResponse | null> {
  if (!key) return null;

  const doc = await findOneScoped(Semaforo, tenantId, { key }).lean<ISemaforoLean>();

  // Un semáforo que ya no está en el catálogo no puede borrar el dato del lead: se devuelve la
  // clave cruda como etiqueta, que es más honesto que un hueco. Hoy no hay borrado, pero un
  // documento escrito antes de este feature o migrado a mano puede llegar aquí.
  if (doc) return toResponse(doc);

  return {
    id: '',
    key,
    label: key,
    color: COLOR_SEMAFORO_DEFECTO,
    orden: 0,
    activo: false,
    esDefecto: false,
  };
}

/**
 * Valida que un `key` pertenezca al catálogo del tenant. La usan el `PATCH /leads/:id/status` antes
 * de escribir y el listado antes de filtrar: sin esto, una clave de otra empresa se grabaría en el
 * lead y nadie podría resolverla después.
 */
export async function existeSemaforo(tenantId: TenantId, key: string): Promise<boolean> {
  return (await countScoped(Semaforo, tenantId, { key })) > 0;
}

/** Cuántos leads del tenant llevan grabado ese semáforo. Para no archivar a ciegas. */
export async function contarLeadsConSemaforo(tenantId: TenantId, key: string): Promise<number> {
  return countScoped(Lead, tenantId, { semaforo: key });
}
