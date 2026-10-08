import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { EstadoTenant } from '../../admin-tenants/types/index.js';
import type { GlobalMetricsParams, MetricsSortField, SortOrder } from '../types/index.js';

export type PeriodoPreset = 'todo' | '30d' | 'mes' | 'personalizado';

export const PAGE_SIZE = 20;

const PRESETS: readonly PeriodoPreset[] = ['todo', '30d', 'mes', 'personalizado'];
const SORTS: readonly MetricsSortField[] = [
  'nombre', 'usuarios', 'conversaciones', 'mensajes', 'leads', 'ventas', 'tasaConversion', 'campanas',
];
const ESTADOS: readonly EstadoTenant[] = ['activo', 'suspendido', 'prueba'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` en la zona horaria del navegador: es "hoy" para quien mira el tablero. */
export function isoDia(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function rangoDePreset(preset: PeriodoPreset, hoy: Date): { desde?: string; hasta?: string } {
  if (preset === '30d') {
    const desde = new Date(hoy);
    desde.setDate(desde.getDate() - 29);
    return { desde: isoDia(desde), hasta: isoDia(hoy) };
  }
  if (preset === 'mes') {
    return { desde: isoDia(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: isoDia(hoy) };
  }
  return {};
}

function pick<T extends string>(valor: string | null, permitidos: readonly T[]): T | undefined {
  return permitidos.includes(valor as T) ? (valor as T) : undefined;
}

export interface MetricsFilters {
  preset: PeriodoPreset;
  desde: string;
  hasta: string;
  page: number;
  sort: MetricsSortField;
  order: SortOrder;
  search: string;
  estado: EstadoTenant | undefined;
  /** Rango efectivo (sin desglose): lo comparten todas las consultas del tablero. */
  rango: Pick<GlobalMetricsParams, 'desde' | 'hasta'>;
  /** Query completa del desglose (con `search` ya debounced). */
  params: GlobalMetricsParams;
  setPreset: (preset: PeriodoPreset) => void;
  setFecha: (campo: 'desde' | 'hasta', valor: string) => void;
  setPage: (page: number) => void;
  toggleSort: (campo: MetricsSortField) => void;
  setSearch: (valor: string) => void;
  setEstado: (estado: EstadoTenant | undefined) => void;
}

/**
 * Filtros del tablero global en la URL (`?periodo=30d&sort=ventas…`): un enlace reproduce
 * exactamente la vista, y no hace falta Zustand porque ninguna otra pantalla los comparte.
 */
export function useMetricsFilters(): MetricsFilters {
  const [params, setParams] = useSearchParams();

  const preset = pick(params.get('periodo'), PRESETS) ?? 'todo';
  const desde = FECHA.test(params.get('desde') ?? '') ? (params.get('desde') as string) : '';
  const hasta = FECHA.test(params.get('hasta') ?? '') ? (params.get('hasta') as string) : '';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const sort = pick(params.get('sort'), SORTS) ?? 'leads';
  const order = pick(params.get('order'), ['asc', 'desc'] as const) ?? 'desc';
  const search = params.get('q') ?? '';
  const estado = pick(params.get('estado'), ESTADOS);
  const searchDebounced = useDebouncedValue(search, 300);

  const rango = useMemo((): Pick<GlobalMetricsParams, 'desde' | 'hasta'> => {
    if (preset !== 'personalizado') return rangoDePreset(preset, new Date());
    // Un rango invertido se ignora en vez de mandar un 400: el formulario ya lo señala.
    if (desde && hasta && hasta < desde) return {};
    return { ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) };
  }, [preset, desde, hasta]);

  const query = useMemo(
    (): GlobalMetricsParams => ({
      ...rango,
      page,
      limit: PAGE_SIZE,
      sort,
      order,
      ...(searchDebounced.trim() ? { search: searchDebounced.trim() } : {}),
      ...(estado ? { estado } : {}),
    }),
    [rango, page, sort, order, searchDebounced, estado],
  );

  function update(cambios: Record<string, string | undefined>, resetPage = true): void {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(cambios)) {
          if (v === undefined || v === '') next.delete(k);
          else next.set(k, v);
        }
        if (resetPage) next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  return {
    preset,
    desde,
    hasta,
    page,
    sort,
    order,
    search,
    estado,
    rango,
    params: query,
    setPreset: (p) =>
      update({ periodo: p === 'todo' ? undefined : p, ...(p === 'personalizado' ? {} : { desde: undefined, hasta: undefined }) }),
    setFecha: (campo, valor) => update({ [campo]: valor }),
    setPage: (p) => update({ page: p > 1 ? String(p) : undefined }, false),
    toggleSort: (campo) => {
      // Primera pulsación: números de mayor a menor, nombres de la A a la Z.
      const inicial: SortOrder = campo === 'nombre' ? 'asc' : 'desc';
      const siguiente: SortOrder = campo === sort ? (order === 'asc' ? 'desc' : 'asc') : inicial;
      update({ sort: campo, order: siguiente });
    },
    setSearch: (valor) => update({ q: valor }),
    setEstado: (e) => update({ estado: e }),
  };
}
