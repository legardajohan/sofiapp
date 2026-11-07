/**
 * Fechas de agenda de los pendientes (HU-PDF-01 A1). Un pendiente se programa como **día civil**
 * (`YYYY-MM-DD`) y, opcionalmente, una hora de reloj (`HH:mm`), ambos en la hora local de quien lo
 * agenda. Estas funciones son puras: reciben `ahora` para poder probarse sin congelar el reloj.
 */

/** Zona IANA del navegador, para que el backend lea los días en el mismo reloj que el usuario. */
export function zonaDelNavegador(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota';
}

/** Una fecha local como día civil `YYYY-MM-DD`, sin pasar por UTC (que podría cambiar el día). */
export function aDiaCivil(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` → `Date` local a medianoche. */
export function deDiaCivil(dia: string): Date {
  const [y, m, d] = dia.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/**
 * ¿Ya pasó? Con hora, cuando llega ese minuto; sin hora («todo el día»), cuando termina el día.
 * Solo es una señal visual: un pendiente vencido sigue abierto hasta que alguien lo cierra.
 */
export function estaVencido(dia: string, hora: string | null, ahora: Date = new Date()): boolean {
  if (!hora) return dia < aDiaCivil(ahora);
  const [h, min] = hora.split(':').map(Number) as [number, number];
  const limite = deDiaCivil(dia);
  limite.setHours(h, min, 0, 0);
  return limite.getTime() < ahora.getTime();
}

/** «Hoy», «Mañana», «Ayer» o «15 oct» (con año si no es el actual). */
export function etiquetaDia(dia: string, ahora: Date = new Date()): string {
  const hoy = aDiaCivil(ahora);
  const manana = new Date(ahora);
  manana.setDate(manana.getDate() + 1);
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);

  if (dia === hoy) return 'Hoy';
  if (dia === aDiaCivil(manana)) return 'Mañana';
  if (dia === aDiaCivil(ayer)) return 'Ayer';

  const fecha = deDiaCivil(dia);
  return fecha.toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    ...(fecha.getFullYear() === ahora.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** «Hoy · 09:30» o «15 oct · Todo el día». */
export function etiquetaProgramacion(
  dia: string,
  hora: string | null,
  ahora: Date = new Date(),
): string {
  return `${etiquetaDia(dia, ahora)} · ${hora ?? 'Todo el día'}`;
}
