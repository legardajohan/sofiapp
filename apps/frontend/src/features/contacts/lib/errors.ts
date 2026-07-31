import axios from 'axios';

/** Mensaje del backend si lo hay: dice más que un genérico ("Correo inválido" > "Error"). */
export function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: unknown } | undefined;
    if (typeof data?.message === 'string') return data.message;
  }
  return fallback;
}

/**
 * Un 403 en las notas **no es un fallo a mostrar**: es que el usuario no tiene el subrol para
 * verlas. La tarjeta se oculta en silencio en vez de acusar un error que no lo es.
 */
export function esSinPermiso(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 403;
}
