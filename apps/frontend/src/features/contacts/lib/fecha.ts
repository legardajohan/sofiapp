/**
 * Fecha y hora de una nota interna.
 *
 * No reutiliza `shortTime` de la bandeja a propósito: aquel formato está pensado para una lista de
 * conversaciones, donde lo que importa es "¿hace cuánto?", y por eso descarta la hora en cuanto el
 * mensaje no es de hoy. Una nota es un asiento del historial —quién dijo qué y cuándo— y ahí la hora
 * es parte del dato: "ayer" no sirve para reconstruir el orden de una negociación.
 */
export function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const ahora = new Date();
  const hora = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

  const mismoDia =
    d.getDate() === ahora.getDate() &&
    d.getMonth() === ahora.getMonth() &&
    d.getFullYear() === ahora.getFullYear();
  if (mismoDia) return `Hoy, ${hora}`;

  // El año solo aparece cuando no es el corriente: repetirlo en cada nota de este año es ruido.
  const fecha = d.toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === ahora.getFullYear() ? {} : { year: 'numeric' }),
  });

  return `${fecha}, ${hora}`;
}

/** Fecha completa para el `title`: el dato exacto queda a un hover, sin cargar la lista. */
export function fechaCompleta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es', { dateStyle: 'full', timeStyle: 'short' });
}
