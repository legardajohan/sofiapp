import { useQuery } from '@tanstack/react-query';
import { getExchangeRateVigente } from '../../../api/admin-plans.js';
import type { EstadoTasa } from '../types/index.js';

const CINCO_MINUTOS = 5 * 60 * 1000;

export interface UseExchangeRateResult {
  /** TRM COP por USD como número, o `null` si la tasa no está disponible. */
  rate: number | null;
  estado: EstadoTasa | null;
  fuente: string | null;
  fechaVigencia: string | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * TRM oficial USD/COP vigente (servidor = fuente de verdad). Cacheada 5 min (TanStack Query).
 * Reutilizable por `PlanForm`, `PlanTable`, `PlanCards` y futuros componentes financieros.
 */
export function useExchangeRate(): UseExchangeRateResult {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['exchange-rate-vigente'],
    queryFn: getExchangeRateVigente,
    staleTime: CINCO_MINUTOS,
  });

  const rateRaw = data?.tasa?.tasaCopPorUsd;
  const parsed = rateRaw !== undefined ? Number(rateRaw) : NaN;
  const rate = Number.isFinite(parsed) && parsed > 0 ? parsed : null;

  return {
    rate,
    estado: data?.estado ?? null,
    fuente: data?.tasa?.fuente ?? null,
    fechaVigencia: data?.tasa?.fechaVigencia ?? null,
    isLoading,
    isError,
    refetch: () => {
      void refetch();
    },
  };
}
