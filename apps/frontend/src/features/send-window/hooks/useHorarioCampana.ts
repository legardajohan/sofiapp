import { useMemo } from 'react';
import { evaluarVentana } from '../lib/politica.js';
import { useSendWindowConfig } from './useSendWindowConfig.js';

export interface HorarioCampana {
  /** La hora elegida cae fuera del horario de campañas. */
  cerrada: boolean;
  /** Primera hora válida a partir de la elegida (`null` si no hay en dos semanas). */
  apertura: Date | null;
  zonaHoraria: string | undefined;
}

/**
 * ¿Una campaña programada para `fecha` saldría a esa hora? Se evalúa en el navegador con la misma
 * política que el backend (espejo en `lib/politica.ts`) para avisar ANTES de enviar el formulario;
 * el servidor lo vuelve a comprobar y responde 422 si no.
 */
export function useHorarioCampana(fecha: Date | null): HorarioCampana {
  const { data: config } = useSendWindowConfig();
  return useMemo(() => {
    if (!config || !fecha) return { cerrada: false, apertura: null, zonaHoraria: config?.zonaHoraria };
    const r = evaluarVentana(config, 'campana', fecha);
    return r.permitido
      ? { cerrada: false, apertura: null, zonaHoraria: config.zonaHoraria }
      : { cerrada: true, apertura: r.siguienteApertura, zonaHoraria: config.zonaHoraria };
  }, [config, fecha]);
}
