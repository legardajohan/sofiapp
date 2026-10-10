import { useMemo } from 'react';
import { useContactOptions } from '@/features/contacts/hooks/useContactOptions';
import { useEstados } from '@/features/estados/hooks/useEstados';
import { ESTADO_LABEL, ESTADOS } from '@/features/leads/lib/format';
import { useSemaforos } from '@/features/semaforos';
import { useTags } from '@/features/tags/hooks/useTags';
import { INTENCIONES, type CatalogosSegmento } from '../lib/segmento.js';

/**
 * Los catálogos del tenant con los que se arma una audiencia, ya como opciones `{key, label, color}`.
 *
 * Cada lista sale de su propia query cacheada, así que montar esto en varios sitios (el constructor,
 * los chips, el resumen de la revisión) no repite peticiones.
 */
export function useCatalogosSegmento(): { catalogos: CatalogosSegmento; cargando: boolean } {
  const estados = useEstados();
  const tags = useTags();
  const semaforos = useSemaforos();
  const opciones = useContactOptions();

  const catalogos = useMemo<CatalogosSegmento>(
    () => ({
      // Las archivadas se incluyen, como las etiquetas: un lead que ya está en una etapa archivada
      // sigue llevando esa clave, y no poder segmentarlo dejaría gente inalcanzable.
      etapas: [...(estados.data ?? [])]
        .sort((a, b) => Number(b.activo) - Number(a.activo) || a.orden - b.orden)
        .map((e) => ({ key: e.key, label: e.label, color: e.color })),
      tagIds: (tags.data ?? []).map((t) => ({ key: t.id, label: t.nombre, color: t.color })),
      semaforoLead: (semaforos.data ?? []).map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
      })),
      intencionCompra: INTENCIONES,
      nivelInteres: (opciones.data?.interes ?? [])
        .filter((o) => o.activo)
        .map((o) => ({ key: o.key, label: o.label, color: o.color })),
      estadoComercial: ESTADOS.map((e) => ({ key: e, label: ESTADO_LABEL[e] })),
    }),
    [estados.data, tags.data, semaforos.data, opciones.data],
  );

  return { catalogos, cargando: estados.isLoading || tags.isLoading };
}
