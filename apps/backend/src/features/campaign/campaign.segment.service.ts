import { Types } from 'mongoose';
import type { FilterQuery } from 'mongoose';
import { findScoped, countScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Lead } from '../lead/lead.model.js';
import type { ICliente, IClienteDocument } from '../cliente/cliente.types.js';
import type { IContactoResumen, ISegmentoFiltros } from './campaign.types.js';

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

  const estado = inSiHay(filtros.estadoComercial);
  if (estado) filtro.estadoComercial = estado;

  const tags = inSiHay(filtros.tagIds?.map((id) => new Types.ObjectId(id)));
  if (tags) filtro.tagIds = tags;

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

/**
 * Filtro completo del segmento. **Único punto de entrada**: todo lo que segmenta pasa por aquí.
 *
 * La exclusión de bajas de marketing es incondicional y va siempre, la pida el usuario o no
 * (criterio 3 del spec). Se compara con `$ne: true` y no con `false` porque los contactos
 * anteriores a HU-MARK-01 no llevan el campo: ausente significa "no ha pedido la baja".
 */
export async function construirFiltroSegmento(
  tenantId: TenantId,
  filtros: ISegmentoFiltros,
): Promise<FilterQuery<IClienteDocument>> {
  const filtro = construirFiltroContacto(filtros);

  filtro.marketingOptOut = { $ne: true };

  if (filtros.semaforoLead && filtros.semaforoLead.length > 0) {
    const clienteIds = await resolverClientesPorSemaforo(tenantId, filtros.semaforoLead);
    // Lista vacía incluida a propósito: si ningún lead lleva esas claves, el segmento es vacío.
    // Omitir la cláusula convertiría "nadie con ese semáforo" en "toda la base", que es justo el
    // error que manda una campaña a quien no debía.
    filtro._id = { $in: clienteIds };
  }

  return filtro;
}

function toContactoResumen(c: Pick<ICliente, 'nombre' | 'telefono'> & { _id: Types.ObjectId }): IContactoResumen {
  return { id: c._id.toString(), nombre: c.nombre ?? null, telefono: c.telefono };
}

/**
 * Conteo y muestra del segmento para el wizard.
 *
 * La muestra proyecta **solo** nombre y teléfono: es una comprobación de que los filtros apuntan a
 * quien el usuario cree, no una exportación de la base, y nada sensible tiene por qué viajar.
 */
export async function previewSegmento(
  tenantId: TenantId,
  filtros: ISegmentoFiltros,
): Promise<{ total: number; muestra: IContactoResumen[] }> {
  const filtro = await construirFiltroSegmento(tenantId, filtros);

  const [total, contactos] = await Promise.all([
    countScoped(Cliente, tenantId, filtro),
    findScoped(Cliente, tenantId, filtro)
      .select('nombre telefono')
      .sort({ ultimoMensajeAt: -1 })
      .limit(TAMANO_MUESTRA)
      .lean<Array<Pick<ICliente, 'nombre' | 'telefono'> & { _id: Types.ObjectId }>>(),
  ]);

  return { total, muestra: contactos.map(toContactoResumen) };
}
