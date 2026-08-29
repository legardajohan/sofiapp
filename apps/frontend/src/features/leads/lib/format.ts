import type { EstadoComercial } from '../../inbox/types.js';

export const ESTADO_LABEL: Record<EstadoComercial, string> = {
  nuevo: 'Nuevo',
  en_gestion: 'En gestión',
  pago_pendiente: 'Pago pendiente',
  pagado: 'Pagado',
  perdido: 'Perdido',
};

export const ESTADOS: EstadoComercial[] = [
  'nuevo',
  'en_gestion',
  'pago_pendiente',
  'pagado',
  'perdido',
];

/** Nombre de respaldo del semáforo. El sembrado real lo pone el tenant y puede haberlo renombrado. */
export const SEMAFORO_LABEL: Record<string, string> = {
  verde: 'Avanza',
  naranja: 'Requiere atención',
  rojo: 'En riesgo',
  azul: 'Informativo',
};

/** `YYYY-MM-DD` en hora local, que es lo que produce y espera un `<input type="date">`. */
export function aInputDate(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

export type RangoKey = 'todo' | 'hoy' | 'ultimos7' | 'ultimos30' | 'esteMes' | 'personalizado';

export interface Rango {
  desde?: string;
  hasta?: string;
}

/**
 * Presets del filtro de fechas. Cubren el caso frecuente sin obligar a teclear dos fechas; el
 * rango libre queda detrás de "Personalizado", que es el único que muestra los dos campos.
 */
export const RANGOS: { key: RangoKey; label: string }[] = [
  { key: 'todo', label: 'Cualquier fecha' },
  { key: 'hoy', label: 'Hoy' },
  { key: 'ultimos7', label: 'Últimos 7 días' },
  { key: 'ultimos30', label: 'Últimos 30 días' },
  { key: 'esteMes', label: 'Este mes' },
  { key: 'personalizado', label: 'Personalizado' },
];

/** Traduce un preset a `{ desde, hasta }`. `personalizado` y `todo` no calculan nada. */
export function rangoAFechas(key: RangoKey, hoy = new Date()): Rango {
  const hasta = aInputDate(hoy);

  switch (key) {
    case 'hoy':
      return { desde: hasta, hasta };
    case 'ultimos7':
      return { desde: aInputDate(sumarDias(hoy, -6)), hasta };
    case 'ultimos30':
      return { desde: aInputDate(sumarDias(hoy, -29)), hasta };
    case 'esteMes':
      return { desde: aInputDate(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta };
    default:
      return {};
  }
}

function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

/**
 * Deduce qué preset representa un rango. Sin esto, recargar la página con `?desde&hasta` en la URL
 * dejaría el selector en "Cualquier fecha" mientras el listado sí está filtrado: el control
 * mentiría sobre lo que se está viendo.
 */
export function fechasARango(rango: Rango, hoy = new Date()): RangoKey {
  if (!rango.desde && !rango.hasta) return 'todo';

  for (const { key } of RANGOS) {
    if (key === 'todo' || key === 'personalizado') continue;
    const candidato = rangoAFechas(key, hoy);
    if (candidato.desde === rango.desde && candidato.hasta === rango.hasta) return key;
  }
  return 'personalizado';
}

/** Fecha corta para las celdas de la tabla, donde el año se sobreentiende salvo que cambie. */
export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

/** Fecha larga e inequívoca para el panel de detalle, que se lee con calma. */
export function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString('es', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * "hace 3 días" para la columna de actividad. Escanear una tabla es comparar antigüedades, y para
 * eso una fecha absoluta obliga a hacer la resta mentalmente en cada fila.
 */
export function haceCuanto(iso: string | null, ahora = new Date()): string {
  if (!iso) return 'Sin mensajes';

  const dias = Math.floor((ahora.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 30) return `Hace ${dias} días`;

  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'Hace un mes' : `Hace ${meses} meses`;
}

/**
 * Color de un estado que no está en el catálogo del tenant: archivado, o el catálogo aún cargando.
 * Gris neutro a propósito — no debe parecer "pagado" ni "perdido" mientras no se sepa qué es.
 */
export const COLOR_ESTADO_DESCONOCIDO = '#475569';
