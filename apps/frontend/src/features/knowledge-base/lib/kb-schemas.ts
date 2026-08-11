import type { IKbDocument, KbEstructura, KbFieldValue } from '../types/index.js';
import { normalizeTitulo } from './kb-presets.js';
import { EMPRESA_SCHEMA } from './schemas/empresa.schema.js';
import { PRODUCTOS_SCHEMA } from './schemas/productos.schema.js';

/**
 * Sistema de campos del modal guiado (HU-KB-07).
 *
 * Este archivo es el **contrato** que consumirán HU-KB-08 a HU-KB-11: cada una declarará el schema
 * de su categoría (empresa, productos, horarios, políticas) sin tocar ni este archivo ni el backend.
 * Aquí solo vive la infraestructura más el schema mínimo `generico`.
 *
 * Regla que no se puede romper: **«Información adicional» no es un campo de ningún schema**. Es el
 * `adicional` del sobre `KbEstructura`, y `KnowledgeStructuredForm` lo renderiza siempre al final.
 * Por eso ningún schema futuro puede olvidarse de ofrecer una vía de texto libre.
 */

// ─── Tipos del contrato ─────────────────────────────────────────────────────

/** Ids de schema conocidos. Cada HU de categoría amplía esta unión con el suyo. */
export type KbSchemaId = 'generico' | 'empresa' | 'productos';

/** Qué control pinta un campo y, con él, qué forma tiene su `KbFieldValue`. */
export type KbFieldKind =
  | 'texto-corto'
  | 'texto-medio'
  | 'texto-largo'
  | 'lista'
  | 'triestado'
  | 'horario'
  | 'repetible';

/**
 * Exigencia del campo:
 *  - `obligatorio` — siempre hay que llenarlo; sin él no se puede guardar.
 *  - `opcional` — nunca bloquea el guardado.
 *  - `condicional` — obligatorio **solo cuando es visible** (ver `visibleSi`).
 */
export type KbRequirement = 'obligatorio' | 'opcional' | 'condicional';

/**
 * Decide si un campo se muestra, a partir del resto de campos.
 *
 * Se respeta con **cualquier** `requisito`, no solo con `condicional`: un `opcional` con predicado
 * aparece y desaparece sin bloquear nunca el guardado, y un `obligatorio` con predicado es exigible
 * solo mientras está visible. Sin esto, un obligatorio oculto dejaría el botón Guardar deshabilitado
 * sin nada que señalarle al admin.
 */
export type KbVisibilityPredicate = (campos: Record<string, KbFieldValue>) => boolean;

interface KbFieldBase {
  /**
   * Clave estable dentro de `KbEstructura.campos`. **NUNCA se renombra**: renombrarla dejaría
   * huérfano el dato ya guardado por los tenants (que el serializer conserva, pero bajo «Otros
   * datos», no bajo su etiqueta). Para cambiar el texto visible se cambia `etiqueta`, no `id`.
   */
  id: string;
  etiqueta: string;
  kind: KbFieldKind;
  /** Tope de caracteres del control. Por defecto, el de su `kind` en `LIMITE_POR_KIND`. */
  maxLength?: number;
  /** Solo `lista` y `repetible`: número máximo de ítems. Por defecto `MAX_ITEMS_DEFAULT`. */
  maxItems?: number;
  /** Texto de ayuda bajo la etiqueta. */
  ayuda?: string;
  /** Solo `repetible`: las columnas de cada ítem. */
  subcampos?: Array<{ id: string; etiqueta: string; maxLength?: number }>;
}

/**
 * Definición de un campo. El `requisito` y `visibleSi` van acoplados en el tipo a propósito:
 * **`condicional` exige su predicado**. Declarar un condicional sin `visibleSi` no compila, porque
 * en tiempo de ejecución se comportaría como un `obligatorio` permanente —siempre visible, siempre
 * exigible— y ese despiste sería invisible hasta que un admin se topara con un Guardar bloqueado.
 *
 * Con esa puerta cerrada, `obligatorio` + `visibleSi` queda como sinónimo legítimo de `condicional`;
 * usa `condicional` cuando la condicionalidad **es** la característica del campo.
 */
export type KbFieldDef = KbFieldBase &
  (
    | { requisito: 'obligatorio' | 'opcional'; visibleSi?: KbVisibilityPredicate }
    | { requisito: 'condicional'; visibleSi: KbVisibilityPredicate }
  );

export interface KbSectionDef {
  id: string;
  titulo: string;
  descripcion?: string;
  campos: KbFieldDef[];
}

export interface KbSchemaDef {
  id: KbSchemaId;
  /** Va tal cual a `KbEstructura.schemaVersion`. Se sube al cambiar campos de forma incompatible. */
  version: number;
  secciones: KbSectionDef[];
}

// ─── Límites ────────────────────────────────────────────────────────────────

/**
 * Tope de caracteres por tipo de control. Para `lista` y `repetible` es el límite de **cada ítem**
 * (o subcampo), no del conjunto; para `triestado` es el del detalle opcional; para `horario` son los
 * 5 caracteres de un `HH:mm`.
 *
 * El tope **global** no vive aquí: es `CONTENIDO_MAX` (10.000) medido sobre el texto ya serializado,
 * porque lo que el backend acota es el texto que va a la IA, no la suma de los campos.
 */
export const LIMITE_POR_KIND: Readonly<Record<KbFieldKind, number>> = {
  'texto-corto': 120,
  'texto-medio': 300,
  'texto-largo': 1500,
  lista: 120,
  triestado: 300,
  horario: 5,
  repetible: 120,
};

/** Tope de ítems de una `lista` o un `repetible` cuando el campo no fija el suyo. */
export const MAX_ITEMS_DEFAULT = 20;

/**
 * Orden canónico de los días. Empieza en lunes, como se lee un horario comercial en Colombia, y no
 * en domingo. Vive aquí y no en el componente porque también fija el orden de serialización.
 */
export const DIAS_SEMANA: readonly string[] = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
];

export function limiteDeCampo(campo: KbFieldDef): number {
  return campo.maxLength ?? LIMITE_POR_KIND[campo.kind];
}

export function maxItemsDeCampo(campo: KbFieldDef): number {
  return campo.maxItems ?? MAX_ITEMS_DEFAULT;
}

// ─── Schemas ────────────────────────────────────────────────────────────────

/**
 * Schema mínimo: **sin secciones**. Su único contenido es «Información adicional», que no es un
 * campo sino el `adicional` del sobre. Sirve de ejemplo del contrato y de piloto del modo
 * estructurado, y es el que usa «Información Complementaria», cuyo formulario guiado es literalmente
 * eso — no le pertenece a ninguna de las HUs 08–11.
 */
const GENERICO: KbSchemaDef = {
  id: 'generico',
  version: 1,
  secciones: [],
};

export const KB_SCHEMAS: Readonly<Record<KbSchemaId, KbSchemaDef>> = {
  generico: GENERICO,
  empresa: EMPRESA_SCHEMA,
  productos: PRODUCTOS_SCHEMA,
};

/**
 * Registry por título de documento: qué formulario le toca a cada categoría.
 *
 * En HU-KB-07 solo hay una entrada. Cada HU siguiente añade la suya, y ese es todo el despliegue
 * que necesita: en cuanto un título figura aquí, sus documentos **vacíos** empiezan a nacer
 * estructurados (`modoEditor`), mientras los que ya tienen texto libre conservan su textarea.
 */
const SCHEMA_POR_TITULO: Readonly<Record<string, KbSchemaId>> = {
  [normalizeTitulo('Información Complementaria')]: 'generico',
  [normalizeTitulo('Información de la empresa')]: 'empresa',
  [normalizeTitulo('Productos y servicios')]: 'productos',
};

export function schemaParaTitulo(titulo: string): KbSchemaDef | undefined {
  const id = SCHEMA_POR_TITULO[normalizeTitulo(titulo)];
  return id === undefined ? undefined : KB_SCHEMAS[id];
}

// ─── En qué modo abre el modal ──────────────────────────────────────────────

export type KbEditorMode = 'legado' | 'estructurado';

function schemaPorId(id: string): KbSchemaDef | undefined {
  return Object.prototype.hasOwnProperty.call(KB_SCHEMAS, id)
    ? KB_SCHEMAS[id as KbSchemaId]
    : undefined;
}

/**
 * Qué schema gobierna el formulario de un documento.
 *
 * Si el documento **ya tiene estructura**, manda su propio `schemaId`, no el registry de títulos:
 * para eso se persiste. Resolver por título haría que renombrar una categoría —o retirarla del
 * registry en una HU futura— mandara a modo legado un documento estructurado, y al guardarlo
 * dejaría su estructura huérfana sin que nadie se entere.
 *
 * Si ese `schemaId` ya no existe (un schema retirado), cae a `generico`: el formulario conserva
 * «Información adicional», y los campos que ya no encajan en ninguna sección siguen llegando al
 * texto bajo «Otros datos». Se degrada, pero no se pierde nada.
 */
export function schemaDeDocumento(doc: IKbDocument | undefined): KbSchemaDef | undefined {
  if (doc === undefined) return undefined;
  if (doc.estructura !== undefined) {
    return schemaPorId(doc.estructura.schemaId) ?? KB_SCHEMAS.generico;
  }
  return schemaParaTitulo(doc.titulo);
}

/**
 * Decide con qué formulario se abre un documento. Es **la** regla de retrocompatibilidad de
 * HU-KB-07 y no admite excepciones:
 *
 *  1. Con `estructura` guardada → estructurado, sin más preguntas.
 *  2. Sin `estructura` pero **con texto** → legado. Un documento que alguien escribió a mano
 *     conserva su textarea **para siempre**: migrarlo por las bravas sería perder o deformar
 *     conocimiento que ya funciona.
 *  3. Sin `estructura` y **sin texto** (incluido un preset virtual), con schema registrado para su
 *     título → estructurado. Nace guiado; no hay retrocompatibilidad que romper donde no hay nada.
 *  4. En cualquier otro caso → legado.
 *
 * De ahí que HU-KB-08 y siguientes solo tengan que registrar el título de su categoría en
 * `SCHEMA_POR_TITULO`: sus presets vacíos empiezan a nacer estructurados sin tocar este archivo.
 */
export function modoEditor(doc: IKbDocument | undefined): KbEditorMode {
  if (doc === undefined) return 'legado'; // creación libre: no hay título todavía
  if (doc.estructura !== undefined) return 'estructurado';
  if (doc.contenido.trim().length > 0) return 'legado';
  return schemaDeDocumento(doc) !== undefined ? 'estructurado' : 'legado';
}

// ─── Utilidades sobre una estructura ────────────────────────────────────────

/** Todos los campos del schema, en el orden canónico (secciones y, dentro, campos). */
export function todosLosCampos(schema: KbSchemaDef): KbFieldDef[] {
  return schema.secciones.flatMap((seccion) => seccion.campos);
}

/**
 * Estructura recién nacida: el sobre con `campos` **vacío**.
 *
 * No se pre-llenan los campos con valores vacíos a propósito: un campo ausente y un campo presente
 * pero en blanco significan lo mismo (`valorVacio` trata ambos igual), y guardar solo lo que el
 * admin escribió mantiene el JSON pequeño y legible.
 */
export function emptyEstructura(schema: KbSchemaDef): KbEstructura {
  return {
    schemaVersion: schema.version,
    schemaId: schema.id,
    campos: {},
    adicional: '',
  };
}

/** Valor inicial de un campo aún sin tocar, para que su control nazca controlado. */
export function valorInicial(campo: KbFieldDef): KbFieldValue {
  switch (campo.kind) {
    case 'lista':
      return { tipo: 'lista', valores: [] };
    case 'triestado':
      return { tipo: 'triestado', valor: 'na' };
    case 'horario':
      return { tipo: 'horario', dias: [] };
    case 'repetible':
      return { tipo: 'repetible', items: [] };
    default:
      return { tipo: 'texto', valor: '' };
  }
}

/**
 * `true` si el campo no aporta nada. Un campo ausente cuenta como vacío.
 *
 * Dos matices deliberados:
 *  - un `triestado` **presente** nunca está vacío: elegir "No aplica" es una respuesta, no un hueco.
 *    Lo que representa "sin responder" es que el campo no esté en `campos`.
 *  - un día marcado "Cerrado" **es** información, así que un horario con días cerrados no está vacío.
 */
export function valorVacio(valor: KbFieldValue | undefined): boolean {
  if (valor === undefined) return true;
  switch (valor.tipo) {
    case 'texto':
      return valor.valor.trim().length === 0;
    case 'lista':
      return valor.valores.every((v) => v.trim().length === 0);
    case 'triestado':
      return false;
    case 'horario':
      return valor.dias.every((dia) => !dia.cerrado && dia.intervalos.length === 0);
    case 'repetible':
      return valor.items.every((item) => Object.values(item).every((v) => v.trim().length === 0));
  }
}

/** `true` si el campo debe pintarse, dado el estado actual del resto. */
export function esVisible(campo: KbFieldDef, campos: Record<string, KbFieldValue>): boolean {
  return campo.visibleSi === undefined || campo.visibleSi(campos);
}

/**
 * Campos exigibles que siguen sin llenar. Vacío ⇒ se puede guardar.
 *
 * Un `condicional` solo cuenta mientras esté visible: exigir un campo que el admin no puede ver
 * dejaría el botón Guardar deshabilitado sin nada que señalar.
 */
export function camposFaltantes(schema: KbSchemaDef, estructura: KbEstructura): KbFieldDef[] {
  return todosLosCampos(schema).filter((campo) => {
    if (campo.requisito === 'opcional') return false;
    if (!esVisible(campo, estructura.campos)) return false;
    return valorVacio(estructura.campos[campo.id]);
  });
}
