import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getKbFaqs } from '../../../api/kb-faqs.js';
import type { KbFaqsListResponse } from '../types/index.js';

/**
 * La lista de FAQs, compartida por la tabla y por la página.
 *
 * Vive en un hook porque el aviso de la página necesita el mismo dato que la tabla y TanStack
 * deduplica por `queryKey`: dos consumidores, una sola petición.
 */
export function useKbFaqs(): UseQueryResult<KbFaqsListResponse> {
  return useQuery<KbFaqsListResponse>({
    queryKey: ['kb', 'faqs'],
    queryFn: () => getKbFaqs({ page: 1, limit: 50 }),
  });
}

/** Lo que la interfaz necesita saber del mínimo de activas, ya resuelto (HU-KB-02-V3). */
export interface EstadoMinimoFaqs {
  activas: number;
  minimo: number;
  /** Cuántas faltan para alcanzar el mínimo; 0 si ya se cumple. */
  faltan: number;
  cumple: boolean;
  /** Si el tenant puede apagar o eliminar una FAQ activa sin bajar del mínimo. */
  puedeReducir: boolean;
}

/**
 * Traduce la respuesta del servidor a la decisión que toman los componentes. Es puro y es el
 * único sitio donde se comparan estos números: ningún componente vuelve a hacer la cuenta.
 *
 * Sin datos todavía asume que NO se puede reducir: mientras carga, es mejor un control inerte de
 * más que uno que invita a una acción que el servidor va a rechazar.
 */
export function estadoMinimo(data: KbFaqsListResponse | undefined): EstadoMinimoFaqs {
  const activas = data?.activas ?? 0;
  const minimo = data?.minimoActivas ?? 0;
  return {
    activas,
    minimo,
    faltan: Math.max(0, minimo - activas),
    cumple: activas >= minimo,
    puedeReducir: data !== undefined && (minimo === 0 || activas > minimo),
  };
}
