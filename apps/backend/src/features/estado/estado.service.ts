import { Types } from 'mongoose';
import {
  countScoped,
  createScoped,
  findByIdScoped,
  findOneAndDeleteScoped,
  findOneAndUpdateScoped,
  findOneScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { Lead } from '../lead/lead.model.js';
import { Estado } from './estado.model.js';
import {
  COLOR_ESTADO_DEFECTO,
  KEY_ESTADO_ENTRADA,
  type CreateEstadoDTO,
  type IEstado,
  type IEstadoResponse,
  type UpdateEstadoDTO,
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
    // `?? false`: los documentos sembrados antes de HU-PIPE-01 no traen el campo, y salir como
    // `undefined` haría que la UI tuviera que distinguir "no es de salida" de "no lo sé".
    esSalida: doc.esSalida ?? false,
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
 * Choque por nombre visible, que es lo que el administrador ve: dos "Visita agendada" en el
 * desplegable son indistinguibles aunque sus claves difieran. Se compara sin acentos ni mayúsculas
 * («pagado» y «Pagado» son el mismo nombre para quien lo lee) y contra **todas** las etapas,
 * incluidas las archivadas: recuperar una archivada no debe chocar con la que la reemplazó.
 */
function mismoNombre(a: string, b: string): boolean {
  return a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;
}

/**
 * Cuántos leads tiene cada etapa, por `key`.
 *
 * Un `countScoped` por etapa en paralelo, no una agregación: `base.repository` no expone `aggregate`
 * y añadirle ese primitivo dejaría el aislamiento colgando de un `$match` que hay que acordarse de
 * escribir primero, en un archivo que usan todos los features. Son tantas cuentas como etapas
 * —del orden de diez— y todas caen sobre el índice `{ tenantId, estado, createdAt }`.
 */
async function contarLeadsPorEtapa(
  tenantId: TenantId,
  keys: string[],
): Promise<Map<string, number>> {
  const cuentas = await Promise.all(keys.map((key) => contarLeadsConEstado(tenantId, key)));
  return new Map(keys.map((key, i) => [key, cuentas[i] ?? 0]));
}

/**
 * El catálogo completo del tenant, en orden de pipeline. Incluye los archivados: la tabla necesita
 * resolver el `label` de un lead cuyo estado ya no se ofrece, y esconderlo dejaría la clave cruda.
 *
 * Con `conUso` cada etapa trae además cuántos leads la llevan grabada, que es lo que la pantalla de
 * gestión necesita para decir "no puedes borrar esta" **antes** de que el administrador lo intente.
 */
export async function listEstados(
  tenantId: TenantId,
  opciones: { conUso?: boolean } = {},
): Promise<IEstadoResponse[]> {
  const docs = await findScoped(Estado, tenantId, {}).sort({ orden: 1 }).lean<IEstadoLean[]>();
  const estados = docs.map(toResponse);

  if (!opciones.conUso) return estados;

  const uso = await contarLeadsPorEtapa(
    tenantId,
    estados.map((e) => e.key),
  );
  return estados.map((estado) => ({ ...estado, leads: uso.get(estado.key) ?? 0 }));
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

  const label = dto.label.trim();
  if (existentes.some((e) => mismoNombre(e.label, label))) {
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
      // Una etapa creada a mano no es de salida: el administrador la marca después si lo es.
      esSalida: false,
    });

    return toResponse(creado as unknown as IEstadoLean);
  } catch (err) {
    if (esKeyDuplicada(err)) throw new AppError('Ya existe un estado con ese nombre.', 409);
    throw err;
  }
}

/**
 * Renombra, recolorea, reordena, marca como salida o (des)archiva una etapa.
 *
 * La `key` **no** se toca: renombrar «Pagado» a «Ganado» tiene que conservar el vínculo con los
 * leads que ya lo llevan, igual que renombrar una opción de contacto o una etiqueta de semáforo.
 *
 * Archivar es la salida para una etapa que no se puede borrar por estar en uso: desaparece del
 * tablero y de los selectores, pero sigue resolviendo su `label` en los leads que la tienen.
 */
export async function updateEstado(
  tenantId: TenantId,
  estadoId: string,
  dto: UpdateEstadoDTO,
): Promise<IEstadoResponse> {
  const actual = await findByIdScoped(Estado, tenantId, estadoId).lean<IEstadoLean>();
  if (!actual) throw new AppError('Etapa no encontrada.', 404);

  if (dto.label !== undefined) {
    const hermanas = await findScoped(Estado, tenantId, { _id: { $ne: actual._id } })
      .select({ label: 1 })
      .lean<{ label: string }[]>();

    if (hermanas.some((e) => mismoNombre(e.label, dto.label as string))) {
      throw new AppError('Ya existe un estado con ese nombre.', 409);
    }
  }

  // Archivar la etapa de entrada rompería el embudo por detrás: los leads convertidos seguirían
  // naciendo en ella (`createLead` escribe `KEY_ESTADO_ENTRADA`) y el tablero, que solo pinta las
  // activas, no los mostraría en ninguna columna. Desaparecerían sin que nadie pudiera decir dónde.
  if (dto.activo === false && actual.key === KEY_ESTADO_ENTRADA) {
    throw new AppError(
      `«${actual.label}» es la etapa donde entran los leads nuevos: no se puede archivar.`,
      409,
      { motivo: 'entrada' },
    );
  }

  const doc = await findOneAndUpdateScoped(
    Estado,
    tenantId,
    { _id: new Types.ObjectId(estadoId) },
    { $set: { ...dto } },
    { new: true, runValidators: true },
  ).lean<IEstadoLean>();
  if (!doc) throw new AppError('Etapa no encontrada.', 404);

  return toResponse(doc);
}

/**
 * Reordena el embudo: la lista de ids llega en el orden deseado y cada etapa recibe su posición.
 *
 * El orden de las etapas **es el flujo de ventas** —el tablero dibuja las columnas en él—, y el que
 * sale del alta es solo el de creación. Por eso se reasigna `orden = índice` a todo el catálogo en
 * vez de tocar una etapa: así las posiciones quedan densas y sin empates, que es lo que un arrastre
 * repetido produciría si cada gesto escribiera un solo número.
 *
 * Se exige una **permutación exacta** del catálogo. Una lista incompleta dejaría a las etapas que
 * faltan con su `orden` viejo, colándose en mitad del nuevo recorrido; una con ids de más significa
 * que el cliente vio un catálogo que ya no existe (alguien borró o creó una etapa mientras
 * arrastraba), y aplicarla a medias es peor que pedirle que recargue.
 *
 * Las archivadas van incluidas: no se pintan en el tablero, pero comparten la escala de `orden` y
 * excluirlas obligaría a inventar dónde caen.
 */
export async function reordenarEstados(
  tenantId: TenantId,
  ids: string[],
): Promise<IEstadoResponse[]> {
  const existentes = await findScoped(Estado, tenantId, {})
    .select({ _id: 1 })
    .lean<{ _id: { toString(): string } }[]>();

  const delTenant = new Set(existentes.map((e) => e._id.toString()));
  const esPermutacion = ids.length === delTenant.size && ids.every((id) => delTenant.has(id));
  if (!esPermutacion) {
    throw new AppError(
      'El orden no coincide con las etapas de la empresa: recarga la página y vuelve a intentarlo.',
      409,
    );
  }

  // Sin transacción a propósito: `orden` es un dato de pintado, así que un fallo a medias deja el
  // embudo con un orden raro pero íntegro, y el siguiente arrastre lo corrige. Una transacción aquí
  // ataría el catálogo a que el despliegue tenga replica set para algo que no lo necesita.
  await Promise.all(
    ids.map((id, orden) =>
      findOneAndUpdateScoped(Estado, tenantId, { _id: new Types.ObjectId(id) }, { $set: { orden } }),
    ),
  );

  return listEstados(tenantId);
}

/**
 * Borra una etapa del catálogo, **solo si no hay ningún lead en ella**.
 *
 * A diferencia de `deleteContactOption`, que archiva por su cuenta lo que está en uso, aquí el
 * borrado se **rechaza** con un 409 que dice cuántos leads la tienen, y archivar queda como una
 * segunda decisión explícita (`PATCH { activo: false }`). El motivo es que quien pulsó «Eliminar»
 * no pidió «Archivar»: hacerlo en su nombre le esconde que la etapa sigue viva en esos leads y le
 * deja creyendo que su embudo tiene una columna menos de las que tiene.
 *
 * `details.enUso` viaja en el error para que el diálogo pueda ofrecer «Ver los leads» y «Archivar»
 * en vez de un mensaje sin salida.
 */
export async function deleteEstado(tenantId: TenantId, estadoId: string): Promise<void> {
  const etapa = await findByIdScoped(Estado, tenantId, estadoId).lean<IEstadoLean>();
  if (!etapa) throw new AppError('Etapa no encontrada.', 404);

  // La etapa de entrada no se borra ni estando vacía: el alta de leads escribe su clave, y sin ella
  // el primer lead convertido nacería apuntando a una etapa que no existe.
  if (etapa.key === KEY_ESTADO_ENTRADA) {
    throw new AppError(
      `«${etapa.label}» es la etapa donde entran los leads nuevos: no se puede eliminar.`,
      409,
      { motivo: 'entrada' },
    );
  }

  const enUso = await contarLeadsConEstado(tenantId, etapa.key);
  if (enUso > 0) {
    throw new AppError(
      `«${etapa.label}» no se puede eliminar: hay ${enUso} ${enUso === 1 ? 'lead' : 'leads'} en esta etapa.`,
      409,
      { motivo: 'en_uso', enUso, key: etapa.key },
    );
  }

  await findOneAndDeleteScoped(Estado, tenantId, { _id: new Types.ObjectId(estadoId) });
}

/**
 * Valida que un `key` pertenezca al catálogo del tenant. La usa el listado de leads antes de
 * filtrar: sin esto, `?estado=` con una clave de otra empresa filtraría por un valor que este
 * tenant no tiene y devolvería una página vacía sin explicar por qué.
 */
export async function existeEstado(tenantId: TenantId, key: string): Promise<boolean> {
  return (await countScoped(Estado, tenantId, { key })) > 0;
}

/**
 * La etapa del catálogo del tenant, o `null` si esa clave no es suya. La usan el tablero y el
 * cambio de etapa, que necesitan algo más que un booleano: el `label`, el `color` y `activo`.
 */
export async function findEstadoByKey(
  tenantId: TenantId,
  key: string,
): Promise<IEstadoResponse | null> {
  const doc = await findOneScoped(Estado, tenantId, { key }).lean<IEstadoLean>();
  return doc ? toResponse(doc) : null;
}

/**
 * `true` solo si la clave existe en el catálogo del tenant **y está activa** (HU-PIPE-01).
 *
 * No basta con `existeEstado`, que es lo que usa el filtro `?estado=` del listado: allí una etapa
 * archivada es legítima —un lead puede llevarla grabada de antes— pero **mover** un lead hacia
 * ella lo haría desaparecer del tablero, que solo pinta las activas, sin que nadie pudiera
 * explicar dónde fue a parar. Por eso escribir es más estricto que leer.
 */
export async function existeEstadoActivo(tenantId: TenantId, key: string): Promise<boolean> {
  return (await countScoped(Estado, tenantId, { key, activo: true })) > 0;
}

/** Cuántos leads del tenant llevan grabado ese estado. Para no archivar ni borrar a ciegas. */
export async function contarLeadsConEstado(tenantId: TenantId, key: string): Promise<number> {
  return countScoped(Lead, tenantId, { estado: key });
}
