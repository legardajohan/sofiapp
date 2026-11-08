import { fechaLocal, sumarDias } from './zona-horaria.js';

/**
 * «hoy a las 8:00», «mañana a las 8:00» o «el lunes, 9 de nov. a las 8:00». La hora se muestra en
 * la zona de la POLÍTICA, no en la del navegador: es la que el admin configuró y la que manda.
 */
export function cuandoAbre(iso: string | Date, zonaHoraria: string, ahora: Date = new Date()): string {
  const fecha = typeof iso === 'string' ? new Date(iso) : iso;
  const hora = new Intl.DateTimeFormat('es-CO', {
    timeZone: zonaHoraria,
    hour: 'numeric',
    minute: '2-digit',
  }).format(fecha);
  const dia = fechaLocal(fecha, zonaHoraria);
  const hoy = fechaLocal(ahora, zonaHoraria);
  if (dia === hoy) return `hoy a las ${hora}`;
  if (dia === sumarDias(hoy, 1)) return `mañana a las ${hora}`;
  const nombre = new Intl.DateTimeFormat('es-CO', {
    timeZone: zonaHoraria,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(fecha);
  return `el ${nombre} a las ${hora}`;
}

/** `YYYY-MM-DD` → «jue, 25 dic 2026» (fecha de calendario, sin zona). */
export function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(a, m - 1, d)));
}

/** `Date` del calendario (medianoche local del navegador) → `YYYY-MM-DD`. */
export function aFechaIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` → `Date` a medianoche local, para el calendario. */
export function deFechaIso(fecha: string): Date {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(a, m - 1, d);
}

/** Zonas ofrecidas en la página. Si la guardada no está en la lista, la página la añade. */
export const ZONAS_HORARIAS: ReadonlyArray<{ valor: string; nombre: string }> = [
  { valor: 'America/Bogota', nombre: 'Bogotá (UTC−5)' },
  { valor: 'America/Lima', nombre: 'Lima (UTC−5)' },
  { valor: 'America/Guayaquil', nombre: 'Guayaquil (UTC−5)' },
  { valor: 'America/Panama', nombre: 'Panamá (UTC−5)' },
  { valor: 'America/Mexico_City', nombre: 'Ciudad de México (UTC−6)' },
  { valor: 'America/Caracas', nombre: 'Caracas (UTC−4)' },
  { valor: 'America/Santiago', nombre: 'Santiago de Chile' },
  { valor: 'America/Argentina/Buenos_Aires', nombre: 'Buenos Aires (UTC−3)' },
  { valor: 'America/Sao_Paulo', nombre: 'São Paulo (UTC−3)' },
  { valor: 'America/New_York', nombre: 'Nueva York' },
  { valor: 'Europe/Madrid', nombre: 'Madrid' },
  { valor: 'UTC', nombre: 'UTC' },
];
