import { Types } from 'mongoose';
import type { FilterQuery } from 'mongoose';
import { aggregateScoped, countScoped, findScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Lead } from '../lead/lead.model.js';
import type { ICliente, IClienteDocument } from '../cliente/cliente.types.js';
import type {
  IAudienciaResponse,
  IContactoResumen,
  IResumenSegmento,
  ISegmentFacetasResponse,
  ISegmentoFiltros,
} from './campaign.types.js';

type TenantId = string | Types.ObjectId;

/** Cuántos contactos se muestran como muestra en el wizard. Es una ojeada, no un listado. */
const TAMANO_MUESTRA = 10;

/** `$in` solo si la lista trae algo: un array vacío no casa con nada y vaciaría el segmento entero. */
function inSiHay<T>(valores: T[] | undefined): { $in: T[] } | null {
  return valores && valores.length > 0 ? { $in: valores } : null;
}

/**
 * Traduce los filtros del contacto a un `FilterQuery`. **Función pura**: no toca Mongo, así que la
 * forma de la consulta se puede probar sin base de datos.
 *
 * No incluye el eje del lead (`semaforoLead`), que necesita una consulta previa, ni la exclusión de
 * bajas: eso lo añade `construirFiltroSegmento`, que es el único punto de entrada seguro.
 */
export function construirFiltroContacto(filtros: ISegmentoFiltros): FilterQuery<IClienteDocument> {
  const filtro: FilterQuery<IClienteDocument> = {};

  const rol = inSiHay(filtros.rolContacto);
  if (rol) filtro.rolContacto = rol;

  const interes = inSiHay(filtros.nivelInteres);
  if (interes) filtro.nivelInteres = interes;

  // Sin índice a propósito: `semaforoIA` no se indexa (cliente.model.ts) y segmentar es una
  // consulta rara, acotada ya por el índice de `tenantId`.
  const intencion = inSiHay(filtros.intencionCompra);
  if (intencion) filtro['semaforoIA.nivelInteres'] = intencion;

  const estado = inSiHay(filtros.estadoComercial);
  if (estado) filtro.estadoComercial = estado;

  // Las etiquetas solo van aquí cuando no hay etapas: con las dos, cómo se juntan lo decide
  // `combinacion`, y eso lo resuelve `construirFiltroSegmento` (las etapas necesitan consultar leads).
  const tags = inSiHay(filtros.tagIds?.map((id) => new Types.ObjectId(id)));
  if (tags && !(filtros.etapas && filtros.etapas.length > 0)) filtro.tagIds = tags;

  // Un `$elemMatch` POR CLAVE, agrupados en `$and`. Con un solo `$elemMatch` que mezclara las dos
  // claves, "grado 11 Y colegio X" pediría que UN MISMO atributo fuera las dos cosas a la vez, y no
  // devolvería a nadie. Con uno por clave, cada condición se evalúa contra su propio elemento.
  const porAtributo = (filtros.atributos ?? [])
    .filter((a) => a.valores.length > 0)
    .map((a) => ({ atributos: { $elemMatch: { key: a.key, valor: { $in: a.valores } } } }));

  if (porAtributo.length > 0) filtro.$and = porAtributo;

  return filtro;
}

/**
 * Resuelve el eje comercial: keys del catálogo `semaforos` → contactos con un lead así clasificado.
 *
 * El semáforo vive en el **lead** (HU-CRM-04), no en el contacto, así que hace falta este salto.
 * Se apoya en el índice `{tenantId, semaforo, createdAt:-1}` que ya existe. Un contacto sin lead
 * queda fuera cuando este filtro se usa, y es lo correcto: una campaña se dirige a oportunidades.
 */
export async function resolverClientesPorSemaforo(
  tenantId: TenantId,
  keys: string[],
): Promise<Types.ObjectId[]> {
  const ids = await findScoped(Lead, tenantId, { semaforo: { $in: keys } }).distinct('clienteId');
  return ids as Types.ObjectId[];
}

/** Contactos con algún lead en estas etapas del CRM (HU-CRM-03). Mismo salto que el semáforo. */
export async function resolverClientesPorEtapa(
  tenantId: TenantId,
  keys: string[],
): Promise<Types.ObjectId[]> {
  const ids = await findScoped(Lead, tenantId, { estado: { $in: keys } }).distinct('clienteId');
  return ids as Types.ObjectId[];
}

/** Intersección de dos listas de ids: dos ejes del lead a la vez se suman en AND, como el resto. */
function intersectar(a: Types.ObjectId[], b: Types.ObjectId[]): Types.ObjectId[] {
  const enB = new Set(b.map((id) => id.toString()));
  return a.filter((id) => enB.has(id.toString()));
}

function aObjectIds(ids: ReadonlyArray<string | Types.ObjectId> | undefined): Types.ObjectId[] {
  return (ids ?? []).map((id) => new Types.ObjectId(id.toString()));
}

/**
 * Lo que los filtros piden, **sin** quitar a nadie: ni bajas ni exclusiones a mano. Es la base de la
 * que sale el resumen (cuántos coinciden y por qué se cae cada uno). Nunca se usa para enviar.
 */
async function construirFiltroCoincidencia(
  tenantId: TenantId,
  filtros: ISegmentoFiltros,
): Promise<FilterQuery<IClienteDocument>> {
  const filtro = construirFiltroContacto(filtros);

  // Ids que imponen los ejes del lead. `null` = ningún eje del lead activo.
  let porLead: Types.ObjectId[] | null = null;

  if (filtros.semaforoLead && filtros.semaforoLead.length > 0) {
    // Lista vacía incluida a propósito: si ningún lead lleva esas claves, el segmento es vacío.
    // Omitir la cláusula convertiría "nadie con ese semáforo" en "toda la base", que es justo el
    // error que manda una campaña a quien no debía.
    porLead = await resolverClientesPorSemaforo(tenantId, filtros.semaforoLead);
  }

  if (filtros.etapas && filtros.etapas.length > 0) {
    const porEtapa = await resolverClientesPorEtapa(tenantId, filtros.etapas);
    const tags = aObjectIds(filtros.tagIds);

    if (tags.length > 0 && filtros.combinacion === 'o') {
      // «En esta etapa O con esta etiqueta». El `$or` va dentro de un `$and` para no pisar el de los
      // atributos. Quien cumple las dos cosas sale una sola vez: la consulta es sobre `Cliente`, no
      // sobre la unión de dos listas.
      filtro.$and = [
        ...(filtro.$and ?? []),
        { $or: [{ _id: { $in: porEtapa } }, { tagIds: { $in: tags } }] },
      ];
    } else {
      if (tags.length > 0) filtro.tagIds = { $in: tags };
      porLead = porLead ? intersectar(porLead, porEtapa) : porEtapa;
    }
  }

  if (porLead) filtro._id = { $in: porLead };

  return filtro;
}

/**
 * Filtro completo del segmento. **Único punto de entrada**: todo lo que segmenta pasa por aquí, y
 * es el mismo filtro con el que se materializan los destinatarios al lanzar.
 *
 * La exclusión de bajas de marketing es incondicional y va siempre, la pida el usuario o no
 * (criterio 3 del spec). Se compara con `$ne: true` y no con `false` porque los contactos
 * anteriores a HU-MARK-01 no llevan el campo: ausente significa "no ha pedido la baja".
 *
 * Los excluidos a mano van en un `$nin` aparte del `_id` de los filtros: excluir solo resta.
 */
export async function construirFiltroSegmento(
  tenantId: TenantId,
  filtros: ISegmentoFiltros,
): Promise<FilterQuery<IClienteDocument>> {
  const filtro = await construirFiltroCoincidencia(tenantId, filtros);
  filtro.marketingOptOut = { $ne: true };

  const excluidos = aObjectIds(filtros.excluirClienteIds);
  if (excluidos.length > 0) {
    filtro.$and = [...(filtro.$and ?? []), { _id: { $nin: excluidos } }];
  }

  return filtro;
}

/**
 * Cuántos teléfonos distintos hay en un filtro. Agregación y no `distinct()`: un segmento de 100 000
 * contactos no debe viajar entero a Node solo para contarlo. El filtro ya llega con tipos de Mongo
 * (ObjectId, no strings), que es lo que exige una agregación: no castea.
 */
async function contarTelefonosUnicos(
  tenantId: TenantId,
  filtro: FilterQuery<IClienteDocument>,
): Promise<number> {
  const [fila] = await aggregateScoped<{ n: number }>(Cliente, tenantId, [
    { $match: filtro },
    { $group: { _id: '$telefono' } },
    { $count: 'n' },
  ]);
  return fila?.n ?? 0;
}

/**
 * Por qué el segmento tiene el tamaño que tiene. Cada número es una consulta acotada por el índice
 * de `tenantId`; se lanzan en paralelo porque no dependen entre sí.
 */
export async function resumirSegmento(
  tenantId: TenantId,
  filtros: ISegmentoFiltros,
): Promise<IResumenSegmento> {
  const [coincidencia, segmento] = await Promise.all([
    construirFiltroCoincidencia(tenantId, filtros),
    construirFiltroSegmento(tenantId, filtros),
  ]);
  const excluidos = aObjectIds(filtros.excluirClienteIds);

  const [coinciden, bajas, excluidosAMano, candidatos, validos] = await Promise.all([
    countScoped(Cliente, tenantId, coincidencia),
    countScoped(Cliente, tenantId, { ...coincidencia, marketingOptOut: true }),
    excluidos.length > 0
      ? countScoped(Cliente, tenantId, {
          ...coincidencia,
          marketingOptOut: { $ne: true },
          $and: [...(coincidencia.$and ?? []), { _id: { $in: excluidos } }],
        })
      : Promise.resolve(0),
    countScoped(Cliente, tenantId, segmento),
    contarTelefonosUnicos(tenantId, segmento),
  ]);

  return { coinciden, bajas, excluidosAMano, duplicados: candidatos - validos, validos };
}

type ContactoLean = Pick<ICliente, 'nombre' | 'telefono'> & { _id: Types.ObjectId };

function toContactoResumen(c: ContactoLean): IContactoResumen {
  return { id: c._id.toString(), nombre: c.nombre ?? null, telefono: c.telefono };
}

/**
 * Conteo y muestra del segmento para el wizard.
 *
 * La muestra proyecta **solo** nombre y teléfono: es una comprobación de que los filtros apuntan a
 * quien el usuario cree, no una exportación de la base, y nada sensible tiene por qué viajar.
 * `total` son teléfonos únicos: exactamente a cuántos se les escribirá al lanzar.
 */
export async function previewSegmento(
  tenantId: TenantId,
  filtros: ISegmentoFiltros,
): Promise<{ total: number; muestra: IContactoResumen[]; resumen: IResumenSegmento }> {
  const filtro = await construirFiltroSegmento(tenantId, filtros);

  const [resumen, contactos] = await Promise.all([
    resumirSegmento(tenantId, filtros),
    findScoped(Cliente, tenantId, filtro)
      .select('nombre telefono')
      .sort({ ultimoMensajeAt: -1 })
      .limit(TAMANO_MUESTRA)
      .lean<ContactoLean[]>(),
  ]);

  return { total: resumen.validos, muestra: contactos.map(toContactoResumen), resumen };
}

/** Escapa una cadena para usarla literal dentro de una `RegExp`: lo que se busca no es un patrón. */
function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * La audiencia de unos filtros, paginada y con búsqueda, para revisarla y quitar a quien sobre.
 *
 * Lista lo que **coincide sin las bajas**, incluidos los excluidos a mano (marcados): si
 * desaparecieran de la lista al quitarlos no habría forma de devolverlos. Las bajas no aparecen: no
 * se pueden reincluir, así que enseñarlas solo invitaría a intentarlo.
 */
export async function listarAudiencia(
  tenantId: TenantId,
  filtros: ISegmentoFiltros,
  opciones: { busqueda?: string; page: number; limit: number },
): Promise<IAudienciaResponse> {
  const filtro = await construirFiltroCoincidencia(tenantId, filtros);
  filtro.marketingOptOut = { $ne: true };

  const busqueda = opciones.busqueda?.trim();
  if (busqueda) {
    const patron = new RegExp(escaparRegex(busqueda), 'i');
    filtro.$and = [...(filtro.$and ?? []), { $or: [{ nombre: patron }, { telefono: patron }] }];
  }

  const excluidos = new Set((filtros.excluirClienteIds ?? []).map((id) => id.toString()));

  const [total, contactos] = await Promise.all([
    countScoped(Cliente, tenantId, filtro),
    findScoped(Cliente, tenantId, filtro)
      .select('nombre telefono')
      // `_id` desempata: sin él, dos contactos con la misma fecha podrían saltar de página.
      .sort({ ultimoMensajeAt: -1, _id: 1 })
      .skip((opciones.page - 1) * opciones.limit)
      .limit(opciones.limit)
      .lean<ContactoLean[]>(),
  ]);

  return {
    data: contactos.map((c) => ({
      ...toContactoResumen(c),
      excluido: excluidos.has(c._id.toString()),
    })),
    page: opciones.page,
    limit: opciones.limit,
    total,
  };
}

/**
 * Cuántos contactos alcanzables hay en cada etapa y cada etiqueta, para pintarlo junto a cada
 * opción del constructor. Solo cuenta a quien no pidió la baja: es la cifra a la que se podría
 * escribir, no el tamaño bruto de la etapa.
 *
 * Por etapa se cuentan **contactos**, no leads: un contacto con dos leads en la misma etapa es una
 * persona, y es a personas a quien llega la campaña.
 */
export async function facetasSegmento(tenantId: TenantId): Promise<ISegmentFacetasResponse> {
  const bajas = (await findScoped(Cliente, tenantId, { marketingOptOut: true }).distinct(
    '_id',
  )) as Types.ObjectId[];

  const [etapas, etiquetas] = await Promise.all([
    aggregateScoped<{ _id: string; contactos: number }>(Lead, tenantId, [
      ...(bajas.length > 0 ? [{ $match: { clienteId: { $nin: bajas } } }] : []),
      { $group: { _id: { estado: '$estado', clienteId: '$clienteId' } } },
      { $group: { _id: '$_id.estado', contactos: { $sum: 1 } } },
    ]),
    aggregateScoped<{ _id: Types.ObjectId; contactos: number }>(Cliente, tenantId, [
      { $match: { marketingOptOut: { $ne: true } } },
      { $unwind: '$tagIds' },
      { $group: { _id: '$tagIds', contactos: { $sum: 1 } } },
    ]),
  ]);

  return {
    etapas: etapas.map((e) => ({ key: e._id, contactos: e.contactos })),
    etiquetas: etiquetas.map((e) => ({ tagId: e._id.toString(), contactos: e.contactos })),
  };
}
