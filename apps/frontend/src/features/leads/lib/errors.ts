import axios from 'axios';

/**
 * Extrae el `leadId` que el backend adjunta al 409 por teléfono duplicado (`AppError.details`).
 * Es lo que permite ofrecer "Ver lead existente" en vez de dejar al asesor en un callejón sin
 * salida. Devuelve `null` para cualquier otro error.
 */
export function leadIdEnConflicto(error: unknown): string | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return null;
  const leadId = (error.response.data as { leadId?: unknown } | undefined)?.leadId;
  return typeof leadId === 'string' ? leadId : null;
}

/** Mensaje del backend si lo hay: dice más que un genérico. */
export function motivo(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
    return error.response.data.message;
  }
  return fallback;
}
