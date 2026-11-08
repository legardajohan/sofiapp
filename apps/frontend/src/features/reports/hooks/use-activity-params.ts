import { useSearchParams } from 'react-router-dom';
import type { Granularidad } from '../types/index.js';

const GRANULARIDADES: readonly Granularidad[] = ['dia', 'semana', 'mes'];
const DEFAULT: Granularidad = 'dia';

export interface ActivityParams {
  granularidad: Granularidad;
  /** `''` = todos los asesores. */
  asesorId: string;
  setGranularidad: (g: Granularidad) => void;
  setAsesorId: (id: string) => void;
}

/**
 * Filtros de la gráfica de tiempo activo en la URL (`?granularidad=semana&asesor=<id>`, HU-REP-06).
 * Conviven con `?periodo=` de `usePeriodParams`: cada uno toca solo sus claves.
 */
export function useActivityParams(): ActivityParams {
  const [params, setParams] = useSearchParams();
  const crudo = params.get('granularidad');
  const granularidad = GRANULARIDADES.includes(crudo as Granularidad) ? (crudo as Granularidad) : DEFAULT;
  const asesorId = /^[0-9a-f]{24}$/i.test(params.get('asesor') ?? '') ? (params.get('asesor') as string) : '';

  function update(clave: string, valor: string | undefined): void {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (valor === undefined || valor === '') next.delete(clave);
        else next.set(clave, valor);
        return next;
      },
      { replace: true },
    );
  }

  return {
    granularidad,
    asesorId,
    setGranularidad: (g) => update('granularidad', g === DEFAULT ? undefined : g),
    setAsesorId: (id) => update('asesor', id),
  };
}
