import type { KbEstructura, KbFieldValue, KbScheduleDay, KbTriEstado } from '../types/index.js';
import {
  KB_SCHEMAS,
  esVisible,
  todosLosCampos,
  valorVacio,
  type KbFieldDef,
  type KbSchemaDef,
  type KbSchemaId,
} from './kb-schemas.js';

/**
 * Deriva el texto indexable a partir de la estructura (HU-KB-07).
 *
 * Este archivo es la **única** fuente del `contenido` de un documento estructurado: el backend lo
 * guarda tal cual y jamás lo re-deriva. De ahí que el determinismo no sea un detalle de estilo — es
 * lo que permite a `updateDocument` decidir "¿cambió algo?" comparando dos strings.
 *
 * Contrato de determinismo (`docs/specs/HU-KB-07-estructura-kb/plan.md`):
 *  1. Orden canónico por schema, no por orden de claves del objeto.
 *  2. Los campos ausentes del schema (dato de una versión anterior) se conservan al final.
 *  3. Los arrays salen en el orden en que el usuario los ingresó; nunca se reordenan.
 *  4. Los campos vacíos se omiten por completo, sin dejar encabezado huérfano.
 *  5. Los campos no visibles se omiten del texto, aunque conserven su valor.
 *  6. `adicional` siempre al final.
 *  7. Sin fecha, sin aleatoriedad y sin nada dependiente de locale.
 */

const TITULO_ADICIONAL = 'Información adicional';
const TITULO_HUERFANOS = 'Otros datos';

const ETIQUETA_TRIESTADO: Readonly<Record<KbTriEstado, string>> = {
  si: 'Sí',
  no: 'No',
  na: 'No aplica',
};

/** Une líneas descartando las vacías: ningún bloque deja huecos dobles. */
function bloque(lineas: Array<string | null>): string[] {
  return lineas.filter((linea): linea is string => linea !== null && linea.length > 0);
}

function serializarDia(dia: KbScheduleDay): string {
  if (dia.cerrado) return `- ${dia.dia}: cerrado`;
  const tramos = dia.intervalos.map((i) => `${i.desde}–${i.hasta}`).join(', ');
  return `- ${dia.dia}: ${tramos}`;
}

/**
 * Un valor, ya con su etiqueta. Devuelve `null` si no aporta texto — así el llamador puede
 * distinguir "no hay nada que escribir" de "hay una cadena vacía".
 */
function serializarValor(etiqueta: string, valor: KbFieldValue): string | null {
  switch (valor.tipo) {
    case 'texto': {
      const texto = valor.valor.trim();
      return texto.length === 0 ? null : `${etiqueta}: ${texto}`;
    }

    case 'lista': {
      const items = valor.valores.map((v) => v.trim()).filter((v) => v.length > 0);
      if (items.length === 0) return null;
      return [`${etiqueta}:`, ...items.map((item) => `- ${item}`)].join('\n');
    }

    case 'triestado': {
      const detalle = valor.detalle?.trim() ?? '';
      const respuesta = ETIQUETA_TRIESTADO[valor.valor];
      return detalle.length === 0
        ? `${etiqueta}: ${respuesta}`
        : `${etiqueta}: ${respuesta} — ${detalle}`;
    }

    case 'horario': {
      // Un día "cerrado" sin intervalos SÍ es información; uno abierto sin intervalos no dice nada.
      const dias = valor.dias.filter((dia) => dia.cerrado || dia.intervalos.length > 0);
      if (dias.length === 0) return null;
      return [`${etiqueta}:`, ...dias.map(serializarDia)].join('\n');
    }

    case 'repetible': {
      const items = valor.items
        .map((item) =>
          Object.entries(item)
            .map(([clave, texto]) => [clave, texto.trim()] as const)
            .filter(([, texto]) => texto.length > 0)
            .map(([clave, texto]) => `${clave}: ${texto}`)
            .join(' · '),
        )
        .filter((linea) => linea.length > 0);
      if (items.length === 0) return null;
      return [`${etiqueta}:`, ...items.map((item) => `- ${item}`)].join('\n');
    }
  }
}

/**
 * Campos guardados que el schema vigente ya no declara. No se descartan nunca: son conocimiento que
 * un tenant escribió con una versión anterior del formulario, y perderlo en silencio al abrir el
 * modal sería la peor clase de bug — invisible hasta que la IA deja de saber algo.
 */
function camposHuerfanos(estructura: KbEstructura, schema: KbSchemaDef | undefined): string[] {
  const declarados = new Set(
    schema === undefined ? [] : todosLosCampos(schema).map((campo) => campo.id),
  );

  return Object.keys(estructura.campos)
    .filter((id) => !declarados.has(id))
    .sort() // el objeto no garantiza orden; el alfabético sí es reproducible
    .map((id) => serializarValor(id, estructura.campos[id] as KbFieldValue))
    .filter((linea): linea is string => linea !== null);
}

function campoAparece(
  campo: KbFieldDef,
  estructura: KbEstructura,
): boolean {
  if (!esVisible(campo, estructura.campos)) return false;
  return !valorVacio(estructura.campos[campo.id]);
}

/**
 * Estructura → texto indexable. Determinista: mismo input, mismo output byte a byte.
 *
 * Sin `schema` se serializan todos los campos por la vía de huérfanos, ordenados por `id`. Es la
 * ruta segura: sin schema no hay forma de conocer el orden canónico ni de evaluar `visibleSi`, y
 * ante la duda es preferible que la IA vea de más a que pierda conocimiento.
 */
export function serializeEstructura(estructura: KbEstructura, schema?: KbSchemaDef): string {
  const partes: string[] = [];

  if (schema !== undefined) {
    for (const seccion of schema.secciones) {
      const lineas = bloque(
        seccion.campos
          .filter((campo) => campoAparece(campo, estructura))
          .map((campo) =>
            serializarValor(campo.etiqueta, estructura.campos[campo.id] as KbFieldValue),
          ),
      );
      // Una sección sin nada que decir no deja ni su encabezado.
      if (lineas.length > 0) partes.push([`## ${seccion.titulo}`, ...lineas].join('\n'));
    }
  }

  const huerfanos = camposHuerfanos(estructura, schema);
  if (huerfanos.length > 0) partes.push([`## ${TITULO_HUERFANOS}`, ...huerfanos].join('\n'));

  const adicional = estructura.adicional.trim();
  if (adicional.length > 0) partes.push([`## ${TITULO_ADICIONAL}`, adicional].join('\n'));

  return partes.join('\n\n');
}

/** Longitud del texto serializado: lo que mide el contador global del modal. */
export function serializedLength(estructura: KbEstructura, schema?: KbSchemaDef): number {
  return serializeEstructura(estructura, schema).length;
}

/**
 * Convierte un documento de texto libre en una estructura, volcando el texto **íntegro** en
 * «Información adicional». Sin pérdida, sin trocear y sin intentar adivinar a qué campo va cada
 * frase: adivinar mal sería peor que no migrar.
 *
 * **Sigue sin consumidor de UI.** HU-KB-07 la dejó lista pensando en conectarla desde HU-KB-08, pero
 * al planear esa HU se difirió: conectarla implica UI propia —un aviso «Completar con el formulario
 * guiado», su confirmación y su deshacer— que afecta a las cuatro categorías por igual y no cabe
 * dentro del alcance de una que solo declara un schema. Queda para una HU de migración propia.
 */
export function migrarLegadoAEstructura(contenido: string, schemaId: KbSchemaId): KbEstructura {
  return {
    schemaVersion: KB_SCHEMAS[schemaId].version,
    schemaId,
    campos: {},
    adicional: contenido.trim(),
  };
}
