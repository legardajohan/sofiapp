import axios from 'axios';

/**
 * Traduce un error de red/API a un mensaje legible. Prioriza el `message` que devuelve el backend
 * (`AppError` y el middleware de validación siempre lo mandan) y, si no hay, cae a un texto propio
 * con el código HTTP para que un fallo nunca se confunda con "no hay datos".
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const apiMessage = error.response?.data?.message;
    if (typeof apiMessage === 'string' && apiMessage.trim() !== '') return apiMessage;
    if (error.response) return `${fallback} (HTTP ${error.response.status})`;
    return 'No hay conexión con el servidor.';
  }
  return fallback;
}
