import { Types } from 'mongoose';
import {
  createScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { ContactField } from './contact-field.model.js';
import {
  CLAVES_RESERVADAS,
  type CreateContactFieldDTO,
  type IContactField,
  type IContactFieldResponse,
  type TipoDatoCampo,
  type UpdateContactFieldDTO,
} from './contact-field.types.js';

type TenantId = string | Types.ObjectId;

/** Forma lean del campo con el `_id` que `IContactField` no declara. */
export interface IContactFieldLean extends IContactField {
  _id: Types.ObjectId;
}

function toResponse(doc: IContactFieldLean): IContactFieldResponse {
  return {
    id: String(doc._id),
    key: doc.key,
    label: doc.label,
    tipoDato: doc.tipoDato,
    sensible: doc.sensible,
    orden: doc.orden,
    activo: doc.activo,
  };
}

/**
 * Clave estable derivada del `label`, calculada **en el servidor**: es la que queda grabada en los
 * contactos y no puede depender de lo que mande el cliente. Mismo criterio que `contact-option`.
 */
export function slugDeLabel(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'campo'
  );
}

/** Etiqueta como la lee una persona: sin mayúsculas, tildes ni espacios repetidos. */
export function normalizarLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/** Forma comparable con `CLAVES_RESERVADAS`: solo letras y números, sin tildes. */
function claveNormalizada(texto: string): string {
  return normalizarLabel(texto).replace(/[^a-z0-9]/g, '');
}

function assertNoReservado(label: string): void {
  if (CLAVES_RESERVADAS.has(claveNormalizada(label)) || CLAVES_RESERVADAS.has(claveNormalizada(slugDeLabel(label)))) {
    throw new AppError(
      `«${label}» ya es un dato fijo del contacto: elígelo en «Dato del contacto» en vez de crear un campo personalizado.`,
      400,
    );
  }
}

function desambiguar(base: string, usadas: Set<string>): string {
  if (!usadas.has(base)) return base;
  const raiz = base.slice(0, 36);
  let n = 2;
  while (usadas.has(`${raiz}-${n}`)) n += 1;
  return `${raiz}-${n}`;
}

/** Los índices únicos `{tenantId,key}` y `{tenantId,labelNormalizado}` son la última defensa. */
function esDuplicado(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

// ─── Lectura ────────────────────────────────────────────────────────────────────

/** Catálogo del tenant. Por defecto solo los activos; el gestor pide también los archivados. */
export async function listContactFields(
  tenantId: TenantId,
  opciones: { incluirArchivados?: boolean } = {},
): Promise<IContactFieldResponse[]> {
  const docs = await findScoped(ContactField, tenantId, opciones.incluirArchivados ? {} : { activo: true })
    .sort({ orden: 1, label: 1 })
    .lean<IContactFieldLean[]>();
  return docs.map(toResponse);
}

/** Campos del catálogo por `key` (activos y archivados), para el flujo y la ficha. */
export async function getCamposPorKey(
  tenantId: TenantId,
  keys: readonly string[],
): Promise<Map<string, IContactFieldLean>> {
  if (keys.length === 0) return new Map();
  const docs = await findScoped(ContactField, tenantId, { key: { $in: [...keys] } }).lean<IContactFieldLean[]>();
  return new Map(docs.map((d) => [d.key, d]));
}

/**
 * Comprueba que cada `key` exista en el catálogo **del tenant** y esté activa. Las archivadas se
 * rechazan salvo las listadas en `archivadasPermitidas` (las que el contacto ya tenía: conservar un
 * dato retirado es válido, agregarlo a otro contacto no). Lanza `400` con la clave ofensora.
 */
export async function assertKeysDelCatalogo(
  tenantId: TenantId,
  keys: readonly string[],
  opciones: { archivadasPermitidas?: readonly string[] } = {},
): Promise<Map<string, IContactFieldLean>> {
  const campos = await getCamposPorKey(tenantId, [...new Set(keys)]);
  const permitidas = new Set(opciones.archivadasPermitidas ?? []);
  for (const key of keys) {
    const campo = campos.get(key);
    if (!campo || (!campo.activo && !permitidas.has(key))) {
      throw new AppError(`El campo «${key}» no existe en el catálogo de esta empresa o fue archivado.`, 400);
    }
  }
  return campos;
}

// ─── Escritura ──────────────────────────────────────────────────────────────────

export async function createContactField(
  tenantId: TenantId,
  dto: CreateContactFieldDTO,
): Promise<IContactFieldResponse> {
  assertNoReservado(dto.label);

  const existentes = await findScoped(ContactField, tenantId, {}).lean<IContactFieldLean[]>();
  const labelNormalizado = normalizarLabel(dto.label);
  const orden = existentes.reduce((max, c) => Math.max(max, c.orden), -1) + 1;

  const mismoLabel = existentes.find((c) => c.labelNormalizado === labelNormalizado);
  if (mismoLabel?.activo) throw new AppError('Ya existe un campo con ese nombre.', 409);

  // Un campo archivado con la misma etiqueta se reactiva en vez de chocar con el índice único: para
  // quien lo archivó y vuelve a escribirlo, lo esperado es tenerlo de vuelta con sus datos.
  if (mismoLabel) {
    const doc = await findOneAndUpdateScoped(
      ContactField,
      tenantId,
      { _id: mismoLabel._id },
      { $set: { label: dto.label, tipoDato: dto.tipoDato, sensible: dto.sensible ?? false, activo: true, orden } },
      { new: true, runValidators: true },
    ).lean<IContactFieldLean>();
    if (!doc) throw new AppError('Campo no encontrado.', 404);
    return toResponse(doc);
  }

  const key = desambiguar(slugDeLabel(dto.label), new Set(existentes.map((c) => c.key)));
  try {
    const doc = await createScoped(ContactField, tenantId, {
      key,
      label: dto.label,
      labelNormalizado,
      tipoDato: dto.tipoDato,
      sensible: dto.sensible ?? false,
      orden,
      activo: true,
    });
    return toResponse(doc.toObject() as IContactFieldLean);
  } catch (err) {
    if (esDuplicado(err)) throw new AppError('Ya existe un campo con ese nombre.', 409);
    throw err;
  }
}

/** Renombra, cambia tipo/sensible u ordena. La `key` **no** se toca: es lo que llevan los contactos. */
export async function updateContactField(
  tenantId: TenantId,
  fieldId: string,
  dto: UpdateContactFieldDTO,
): Promise<IContactFieldResponse> {
  const actual = await findByIdScoped(ContactField, tenantId, fieldId).lean<IContactFieldLean>();
  if (!actual) throw new AppError('Campo no encontrado.', 404);

  const $set: Record<string, unknown> = {};
  if (dto.label !== undefined) {
    assertNoReservado(dto.label);
    const labelNormalizado = normalizarLabel(dto.label);
    const hermanos = await findScoped(ContactField, tenantId, {
      _id: { $ne: actual._id },
      labelNormalizado,
    }).lean<IContactFieldLean[]>();
    if (hermanos.length > 0) throw new AppError('Ya existe un campo con ese nombre.', 409);
    $set['label'] = dto.label;
    $set['labelNormalizado'] = labelNormalizado;
  }
  if (dto.tipoDato !== undefined) $set['tipoDato'] = dto.tipoDato;
  if (dto.sensible !== undefined) $set['sensible'] = dto.sensible;
  if (dto.orden !== undefined) $set['orden'] = dto.orden;

  try {
    const doc = await findOneAndUpdateScoped(
      ContactField,
      tenantId,
      { _id: actual._id },
      { $set },
      { new: true, runValidators: true },
    ).lean<IContactFieldLean>();
    if (!doc) throw new AppError('Campo no encontrado.', 404);
    return toResponse(doc);
  } catch (err) {
    if (esDuplicado(err)) throw new AppError('Ya existe un campo con ese nombre.', 409);
    throw err;
  }
}

/** El borrado **archiva**: deja de ofrecerse, pero los contactos que ya lo tienen lo conservan. */
export async function archiveContactField(tenantId: TenantId, fieldId: string): Promise<void> {
  const doc = await findOneAndUpdateScoped(
    ContactField,
    tenantId,
    { _id: new Types.ObjectId(fieldId) },
    { $set: { activo: false } },
    { new: true },
  ).lean<IContactFieldLean>();
  if (!doc) throw new AppError('Campo no encontrado.', 404);
}

/**
 * Registra en el catálogo los atributos que un contacto **ya tiene** y que aún no están en él
 * (heredados de antes de HU-FLOW-05, o creados por la extracción con IA). Es idempotente. Sirve al
 * backfill y a la edición de la ficha: sin esto, volver a guardar un contacto con un atributo
 * antiguo daría `400`. Un atributo que choca con una clave reservada o con una etiqueta ya usada se
 * omite y queda en el log: no se puede registrar sin romper una invariante del catálogo.
 */
export async function registrarCamposHeredados(
  tenantId: TenantId,
  atributos: readonly { key: string; label: string; sensible: boolean }[],
): Promise<number> {
  if (atributos.length === 0) return 0;
  const existentes = await findScoped(ContactField, tenantId, {}).lean<IContactFieldLean[]>();
  const keys = new Set(existentes.map((c) => c.key));
  const labels = new Set(existentes.map((c) => c.labelNormalizado));
  let orden = existentes.reduce((max, c) => Math.max(max, c.orden), -1) + 1;
  let creados = 0;

  for (const a of atributos) {
    if (keys.has(a.key)) continue;
    const labelNormalizado = normalizarLabel(a.label);
    if (CLAVES_RESERVADAS.has(claveNormalizada(a.label)) || CLAVES_RESERVADAS.has(claveNormalizada(a.key))) {
      logger.warn('Atributo omitido del catálogo: su clave está reservada.', { tenantId: tenantId.toString(), key: a.key });
      continue;
    }
    if (labels.has(labelNormalizado)) {
      logger.warn('Atributo omitido del catálogo: su etiqueta ya existe.', { tenantId: tenantId.toString(), key: a.key });
      continue;
    }
    try {
      await createScoped(ContactField, tenantId, {
        key: a.key,
        label: a.label,
        labelNormalizado,
        tipoDato: 'texto' satisfies TipoDatoCampo,
        sensible: a.sensible,
        orden,
        activo: true,
      });
      keys.add(a.key);
      labels.add(labelNormalizado);
      orden += 1;
      creados += 1;
    } catch (err) {
      if (!esDuplicado(err)) throw err;
    }
  }
  return creados;
}
