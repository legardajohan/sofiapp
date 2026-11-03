import { useSendWindowStatus } from './useSendWindowStatus.js';
import type { CategoriaEnvio } from '../types.js';

export interface VentanaCategoria {
  cerrada: boolean;
  apertura: string | null;
  zonaHoraria: string | undefined;
}

/**
 * ¿Está cerrada AHORA la ventana de envío de esta categoría? Mientras carga, o si falla la
 * consulta, se asume abierta: el backend decide igual con su 423, y bloquear el composer por una
 * petición lenta sería peor que dejar que el servidor diga que no.
 */
export function useVentanaCategoria(categoria: CategoriaEnvio): VentanaCategoria {
  const { data } = useSendWindowStatus();
  const estado = data?.categorias[categoria];
  return {
    cerrada: data?.activo === true && estado?.permitido === false,
    apertura: estado?.siguienteApertura ?? null,
    zonaHoraria: data?.zonaHoraria,
  };
}
