import { createHash } from 'node:crypto';
import { findScoped } from '../../repositories/base.repository.js';
import { TEMA_OTROS } from '../../integrations/llm/llm-provider.types.js';
import { KbDocument } from './kb-document.model.js';

/*
 * Lector de los productos de la tarjeta «Productos y servicios» de la KB (HU-REP-03).
 *
 * **Acoplamiento documentado (ADR 0012).** El backend guarda `estructura` sin interpretarla
 * (HU-KB-07): el frontend es el dueño de los schemas de campo. Este archivo es el ÚNICO punto del
 * backend que la lee, y se apoya en los ids que HU-KB-09 congeló — en cuanto un tenant guarda,
 * renombrarlos deja su dato huérfano, así que no van a cambiar sin una migración. Un test fija el
 * contrato para que un cambio en el frontend no rompa el reporte en silencio.
 */

/** `KbSchemaDef.id` del formulario «Productos y servicios» (`productos.schema.ts`). Congelado. */
export const KB_SCHEMA_PRODUCTOS = 'productos';
/** Campo `repetible` con las filas `{ nombre, descripcion }`. Congelado. */
export const KB_CAMPO_CATALOGO = 'catalogo';

export interface ProductoKb {
  /** Nombre normalizado: la identidad del producto, porque las filas de la KB no tienen id. */
  clave: string;
  nombre: string;
  descripcion?: string;
}

export interface ProductosKb {
  productos: ProductoKb[];
  /** Hash corto de la lista. Cambia al añadir, quitar, renombrar o redescribir un producto. */
  version: string;
}

const SIN_PRODUCTOS: ProductosKb = { productos: [], version: '' };

/**
 * Minúsculas, sin acentos y sin espacios repetidos. «Curso  Pre-ICFES» y «curso pre-icfes» son el
 * mismo producto: sin esto, un retoque de mayúsculas en la KB partiría el ranking en dos filas.
 */
export function normalizarClave(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Filas `{ nombre, descripcion }` del campo `catalogo`, o `[]` ante cualquier forma inesperada. */
function filasDelCatalogo(estructura: unknown): ProductoKb[] {
  if (!esObjeto(estructura) || estructura['schemaId'] !== KB_SCHEMA_PRODUCTOS) return [];
  const campos = estructura['campos'];
  if (!esObjeto(campos)) return [];
  const catalogo = campos[KB_CAMPO_CATALOGO];
  if (!esObjeto(catalogo) || catalogo['tipo'] !== 'repetible' || !Array.isArray(catalogo['items'])) {
    return [];
  }

  const vistos = new Set<string>();
  const productos: ProductoKb[] = [];
  for (const item of catalogo['items'] as unknown[]) {
    if (!esObjeto(item)) continue;
    const nombre = texto(item['nombre']);
    const clave = normalizarClave(nombre);
    // Una fila sin nombre no es un producto que la IA pueda elegir; una repetida, tampoco una nueva.
    // Y «Otros» chocaría con el valor reservado del clasificador: se confundiría con «ninguno».
    if (!clave || clave === TEMA_OTROS || vistos.has(clave)) continue;
    vistos.add(clave);
    const descripcion = texto(item['descripcion']);
    productos.push({ clave, nombre, ...(descripcion ? { descripcion } : {}) });
  }
  return productos;
}

/**
 * Versión de la lista: entra en la caché del clasificador y en `temaIA.catalogoVersion`, así que
 * editar la KB reclasifica en la siguiente ráfaga. Ordenada para que reordenar filas no cuente
 * como cambio: el modelo recibe las mismas opciones.
 */
function versionDe(productos: ProductoKb[]): string {
  if (productos.length === 0) return '';
  const firma = productos
    .map((p) => `${p.clave}:${p.descripcion ?? ''}`)
    .sort()
    .join('\n');
  return createHash('sha1').update(firma).digest('hex').slice(0, 12);
}

/**
 * Productos que el tenant cargó en su KB. **Nunca lanza por un dato mal formado**: la estructura es
 * JSON opaco escrito por el frontend y un documento raro no puede tumbar ni el worker ni el reporte.
 *
 * Lee todos los documentos visibles del tenant y filtra en memoria: hay ~5 por tenant y el único
 * índice útil es `{ tenantId, titulo }`, que no sirve para buscar por `schemaId`.
 */
export async function listarProductosKb(tenantId: string): Promise<ProductosKb> {
  const docs = await findScoped(KbDocument, tenantId, { oculto: { $ne: true } })
    .select({ estructura: 1 })
    .lean<Array<{ estructura?: unknown }>>();

  const doc = docs.find((d) => esObjeto(d.estructura) && d.estructura['schemaId'] === KB_SCHEMA_PRODUCTOS);
  if (!doc) return SIN_PRODUCTOS;

  const productos = filasDelCatalogo(doc.estructura);
  return productos.length > 0 ? { productos, version: versionDe(productos) } : SIN_PRODUCTOS;
}
