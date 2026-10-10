import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Periodo de un reporte en la URL (`?periodo=7d`, `?periodo=personalizado&desde=…&hasta=…`).
 * Compartido por el tablero global (HU-SAAS-03) y el reporte por asesor (HU-REP-01): un enlace
 * reproduce exactamente el periodo que estaba mirando quien lo compartió.
 */

export type PeriodoPreset = 'todo' | '7d' | '30d' | 'mes' | 'personalizado';

export const PERIODO_LABEL: Record<PeriodoPreset, string> = {
  todo: 'Todo el historial',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  mes: 'Este mes',
  personalizado: 'Fechas personalizadas',
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` en la zona horaria del navegador: es "hoy" para quien mira el reporte. */
export function isoDia(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function ultimosDias(hoy: Date, dias: number): { desde: string; hasta: string } {
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - (dias - 1));
  return { desde: isoDia(desde), hasta: isoDia(hoy) };
}

function rangoDePreset(preset: PeriodoPreset, hoy: Date): { desde?: string; hasta?: string } {
  if (preset === '7d') return ultimosDias(hoy, 7);
  if (preset === '30d') return ultimosDias(hoy, 30);
  if (preset === 'mes') return { desde: isoDia(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: isoDia(hoy) };
  return {};
}

export interface PeriodParams {
  presets: readonly PeriodoPreset[];
  preset: PeriodoPreset;
  /** Fechas crudas del modo personalizado (`''` si no hay). */
  desde: string;
  hasta: string;
  /** El modo personalizado tiene la fecha final antes que la inicial. */
  invertido: boolean;
  /** Rango efectivo a enviar al API. Vacío = sin filtro (o el default del backend). */
  rango: { desde?: string; hasta?: string };
  setPreset: (preset: PeriodoPreset) => void;
  setFecha: (campo: 'desde' | 'hasta', valor: string) => void;
}

interface Options {
  presets: readonly PeriodoPreset[];
  defaultPreset: PeriodoPreset;
}

export function usePeriodParams({ presets, defaultPreset }: Options): PeriodParams {
  const [params, setParams] = useSearchParams();

  const crudo = params.get('periodo');
  const preset = presets.includes(crudo as PeriodoPreset) ? (crudo as PeriodoPreset) : defaultPreset;
  const desde = FECHA.test(params.get('desde') ?? '') ? (params.get('desde') as string) : '';
  const hasta = FECHA.test(params.get('hasta') ?? '') ? (params.get('hasta') as string) : '';
  const invertido = preset === 'personalizado' && desde !== '' && hasta !== '' && hasta < desde;

  const rango = useMemo((): { desde?: string; hasta?: string } => {
    if (preset !== 'personalizado') return rangoDePreset(preset, new Date());
    // Un rango invertido no se envía (sería un 400): el formulario ya lo señala.
    if (invertido) return {};
    return { ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) };
  }, [preset, desde, hasta, invertido]);

  function update(cambios: Record<string, string | undefined>): void {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(cambios)) {
          if (v === undefined || v === '') next.delete(k);
          else next.set(k, v);
        }
        // Cambiar el periodo cambia el conjunto: la página anterior deja de tener sentido.
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  return {
    presets,
    preset,
    desde,
    hasta,
    invertido,
    rango,
    setPreset: (p) =>
      update({
        periodo: p === defaultPreset ? undefined : p,
        ...(p === 'personalizado' ? {} : { desde: undefined, hasta: undefined }),
      }),
    setFecha: (campo, valor) => update({ [campo]: valor }),
  };
}
