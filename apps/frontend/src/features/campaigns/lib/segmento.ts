import type { IntencionCompra, SegmentoFiltros } from '../types.js';

/** Una opción de un catálogo segmentable: etapa, etiqueta, semáforo, intención o nivel de interés. */
export interface OpcionSegmento {
  key: string;
  label: string;
  /** Hex del tenant. Ausente en escalas sin color propio. */
  color?: string;
}

/** Escala cerrada de la IA (HU-IA-05), de más frío a más caliente: el orden en que se lee. */
export const INTENCIONES: Array<OpcionSegmento & { key: IntencionCompra }> = [
  { key: 'frio', label: 'Frío', color: '#2563EB' },
  { key: 'tibio', label: 'Tibio', color: '#D97706' },
  { key: 'caliente', label: 'Caliente', color: '#DC2626' },
];

/** Los ejes que el constructor deja tocar. `atributos` y `rolContacto` solo se leen de campañas viejas. */
export type EjeSegmento =
  'etapas' | 'tagIds' | 'semaforoLead' | 'intencionCompra' | 'nivelInteres' | 'estadoComercial';

export const NOMBRE_EJE: Record<EjeSegmento, string> = {
  etapas: 'Etapa',
  tagIds: 'Etiqueta',
  semaforoLead: 'Semáforo',
  intencionCompra: 'Intención',
  nivelInteres: 'Interés',
  estadoComercial: 'Estado comercial',
};

export type CatalogosSegmento = Partial<Record<EjeSegmento, OpcionSegmento[]>>;

/** Un criterio aplicado, tal como se pinta en la fila de chips. */
export interface CriterioAplicado {
  eje: EjeSegmento;
  key: string;
  label: string;
  color?: string;
}

const ORDEN_EJES: EjeSegmento[] = [
  'etapas',
  'tagIds',
  'semaforoLead',
  'intencionCompra',
  'nivelInteres',
  'estadoComercial',
];

function valoresDe(filtros: SegmentoFiltros, eje: EjeSegmento): string[] {
  return (filtros[eje] as string[] | undefined) ?? [];
}

/**
 * Los criterios activos, en el orden de la pantalla. Una clave que ya no está en el catálogo (una
 * etiqueta borrada, p. ej.) se muestra con su clave cruda en vez de desaparecer: sigue filtrando, y
 * esconderla haría que el contador no cuadrara con lo que se ve.
 */
export function criteriosAplicados(
  filtros: SegmentoFiltros,
  catalogos: CatalogosSegmento,
): CriterioAplicado[] {
  return ORDEN_EJES.flatMap((eje) =>
    valoresDe(filtros, eje).map((key) => {
      const opcion = catalogos[eje]?.find((o) => o.key === key);
      return { eje, key, label: opcion?.label ?? key, color: opcion?.color };
    }),
  );
}

/** Quita un valor de un eje. Un eje que se queda vacío se borra: `[]` y ausente significan lo mismo. */
export function quitarCriterio(
  filtros: SegmentoFiltros,
  eje: EjeSegmento,
  key: string,
): SegmentoFiltros {
  const restantes = valoresDe(filtros, eje).filter((k) => k !== key);
  const siguiente: SegmentoFiltros = { ...filtros };
  if (restantes.length > 0) {
    (siguiente as Record<EjeSegmento, string[]>)[eje] = restantes;
  } else {
    delete siguiente[eje];
  }
  return siguiente;
}

/**
 * Vacía los criterios pero **conserva** las exclusiones a mano y la forma de combinar: son decisiones
 * sobre personas concretas, y volver a armar el segmento no debería devolver a quien se quitó.
 */
export function limpiarCriterios(filtros: SegmentoFiltros): SegmentoFiltros {
  const siguiente: SegmentoFiltros = {};
  if (filtros.combinacion) siguiente.combinacion = filtros.combinacion;
  if (filtros.excluirClienteIds?.length) siguiente.excluirClienteIds = filtros.excluirClienteIds;
  return siguiente;
}

/** Los filtros que definen QUIÉN aparece en la lista, sin las exclusiones (que solo marcan casillas). */
export function sinExclusiones(filtros: SegmentoFiltros): SegmentoFiltros {
  const resto: SegmentoFiltros = { ...filtros };
  delete resto.excluirClienteIds;
  return resto;
}

/** Devuelve a todos los que se quitaron a mano. */
export function devolverExcluidos(filtros: SegmentoFiltros): SegmentoFiltros {
  return sinExclusiones(filtros);
}

/** Alterna a un contacto entre incluido y quitado a mano. */
export function alternarExclusion(filtros: SegmentoFiltros, clienteId: string): SegmentoFiltros {
  const actuales = filtros.excluirClienteIds ?? [];
  const excluirClienteIds = actuales.includes(clienteId)
    ? actuales.filter((id) => id !== clienteId)
    : [...actuales, clienteId];
  const siguiente: SegmentoFiltros = { ...filtros, excluirClienteIds };
  if (excluirClienteIds.length === 0) delete siguiente.excluirClienteIds;
  return siguiente;
}

/** Combinar solo significa algo cuando hay etapas Y etiquetas a la vez. */
export function combinacionRelevante(filtros: SegmentoFiltros): boolean {
  return (filtros.etapas?.length ?? 0) > 0 && (filtros.tagIds?.length ?? 0) > 0;
}
