import axios from 'axios';
import type { BloqueoBorrado, MotivoBloqueo } from '../types.js';

const MOTIVOS: MotivoBloqueo[] = ['en_uso', 'entrada'];

/**
 * Lee el `409` con el que el backend rechaza el borrado de una etapa.
 *
 * El diálogo necesita más que el texto: con `en_uso` ofrece archivar y enlazar a los leads que la
 * bloquean, y con `entrada` solo puede explicar por qué esa etapa no se toca. Sin esto habría que
 * adivinar el caso a partir del mensaje, que es exactamente lo que se rompe al reescribirlo.
 */
export function bloqueoEnError(error: unknown): BloqueoBorrado | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return null;

  const data = error.response.data as { motivo?: unknown; enUso?: unknown } | undefined;
  const motivo = MOTIVOS.find((m) => m === data?.motivo);
  if (!motivo) return null;

  return { motivo, enUso: typeof data?.enUso === 'number' ? data.enUso : 0 };
}
