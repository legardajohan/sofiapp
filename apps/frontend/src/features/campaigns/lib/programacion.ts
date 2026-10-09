import { formatearTamano } from '@/features/inbox/lib/media';

/**
 * Reglas del programador de campañas (HU-MARK-03) que se pueden probar sin React.
 *
 * Son un espejo de lo que valida el backend, solo para avisar antes de subir: la decisión final la
 * toma siempre el servidor.
 */

/** Meta acepta JPG y PNG en la cabecera de una plantilla, hasta 5 MB. */
export const MIMES_IMAGEN = ['image/jpeg', 'image/png'] as const;
export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;
export const ACCEPT_IMAGEN = MIMES_IMAGEN.join(',');

/** Antelación mínima que exige el backend. Se deja un margen para el tiempo de subida. */
export const ANTELACION_MINIMA_MS = 2 * 60_000;

export type ValidacionImagen = { ok: true } | { ok: false; motivo: string };

export function validarImagen(file: File): ValidacionImagen {
  const mime = file.type.toLowerCase();
  if (!(MIMES_IMAGEN as readonly string[]).includes(mime)) {
    return { ok: false, motivo: 'La imagen tiene que ser JPG o PNG.' };
  }
  if (file.size > MAX_BYTES_IMAGEN) {
    return {
      ok: false,
      motivo: `La imagen pesa ${formatearTamano(file.size)} y el máximo es ${formatearTamano(
        MAX_BYTES_IMAGEN,
      )}.`,
    };
  }
  return { ok: true };
}

/** `'09:30'` a partir de una fecha, en hora local del navegador. */
export function horaDe(fecha: Date): string {
  const hh = String(fecha.getHours()).padStart(2, '0');
  const mm = String(fecha.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Une el día elegido en el calendario con la hora `HH:mm`, en hora local. */
export function combinarFechaHora(dia: Date, hora: string): Date {
  const [hh, mm] = hora.split(':').map(Number);
  const resultado = new Date(dia);
  resultado.setHours(hh ?? 0, mm ?? 0, 0, 0);
  return resultado;
}

/** Zona horaria del navegador, para decirla en voz alta junto a la hora. */
export function zonaHoraria(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** «jueves 12 de noviembre, 9:00 a. m.» */
export function fechaLarga(fecha: Date): string {
  const dia = fecha.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  const hora = fecha.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  return `${dia}, ${hora}`;
}

/**
 * «dentro de 3 días», «dentro de 2 horas», «dentro de 15 minutos». Lo que importa al programar no
 * es la fecha exacta —ya está en el control— sino confirmar que es la que uno cree.
 */
export function distanciaRelativa(fecha: Date, ahora: Date = new Date()): string {
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const minutos = Math.round((fecha.getTime() - ahora.getTime()) / 60_000);
  if (Math.abs(minutos) < 60) return rtf.format(minutos, 'minute');
  const horas = Math.round(minutos / 60);
  if (Math.abs(horas) < 24) return rtf.format(horas, 'hour');
  return rtf.format(Math.round(horas / 24), 'day');
}

/** Por qué una hora no sirve, o `null` si sirve. */
export function problemaConHora(fecha: Date | null, ahora: Date = new Date()): string | null {
  if (!fecha) return 'Elige el día y la hora del envío.';
  if (fecha.getTime() - ahora.getTime() < ANTELACION_MINIMA_MS) {
    return 'Elige una hora con al menos unos minutos de margen.';
  }
  return null;
}
