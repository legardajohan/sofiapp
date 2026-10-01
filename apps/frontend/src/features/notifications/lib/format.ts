/**
 * Relativo de grano fino para la campanita: a diferencia de `haceCuanto` de leads (que trabaja por
 * día, pensado para una tabla), una notificación casi siempre es de hace segundos o minutos.
 */
export function haceRelativo(iso: string, ahora = new Date()): string {
  const segundos = Math.floor((ahora.getTime() - new Date(iso).getTime()) / 1000);
  if (segundos < 60) return 'Ahora';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
