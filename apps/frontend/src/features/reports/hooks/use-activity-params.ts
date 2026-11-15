import { useSearchParams } from 'react-router-dom';
import type { Granularidad } from '../types/index.js';

const GRANULARIDADES: readonly Granularidad[] = ['dia', 'semana', 'mes'];
const DEFAULT: Granularidad = 'dia';

export interface ActivityParams {
  granularidad: Granularidad;
  setGranularidad: (g: Granularidad) => void;
}

/**
 * Granularidad de la gráfica de tiempo activo en la URL (`?granularidad=semana`, HU-REP-06). El rol y
 * la persona (AUTH-06) van en `useFiltroRolUsuarioParam('actividadGrupo', 'asesor')`.
 * Conviven con `?periodo=` de `usePeriodParams`: cada uno toca solo sus claves.
 */
export function useActivityParams(): ActivityParams {
  const [params, setParams] = useSearchParams();
  const crudo = params.get('granularidad');
  const granularidad = GRANULARIDADES.includes(crudo as Granularidad) ? (crudo as Granularidad) : DEFAULT;

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
    setGranularidad: (g) => update('granularidad', g === DEFAULT ? undefined : g),
  };
}
