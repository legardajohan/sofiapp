import type { IHorarioTrigger, ITriggerFlow, TipoTrigger } from '../types.js';

/** Orden de lectura en el selector (lunes primero); `valor` sigue la convención de `Date#getDay`
 *  que usa el backend (0 = domingo). */
export const DIAS_SEMANA: { valor: number; corto: string; largo: string }[] = [
  { valor: 1, corto: 'L', largo: 'Lunes' },
  { valor: 2, corto: 'M', largo: 'Martes' },
  { valor: 3, corto: 'X', largo: 'Miércoles' },
  { valor: 4, corto: 'J', largo: 'Jueves' },
  { valor: 5, corto: 'V', largo: 'Viernes' },
  { valor: 6, corto: 'S', largo: 'Sábado' },
  { valor: 0, corto: 'D', largo: 'Domingo' },
];

export const TRIGGER_LABEL: Record<TipoTrigger, string> = {
  siempre: 'Con cualquier mensaje',
  palabra_clave: 'Cuando el mensaje contiene una palabra',
  primer_mensaje: 'Solo en el primer mensaje del cliente',
  horario: 'Solo dentro de un horario',
};

export const ZONAS_COMUNES = [
  'America/Bogota',
  'America/Mexico_City',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Caracas',
  'America/New_York',
  'Europe/Madrid',
];

function zonaDelNavegador(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota';
  } catch {
    return 'America/Bogota';
  }
}

/** Horario de oficina típico como punto de partida: más rápido de ajustar que uno vacío. */
export function horarioPorDefecto(): IHorarioTrigger {
  return { dias: [1, 2, 3, 4, 5], desde: '08:00', hasta: '18:00', zonaHoraria: zonaDelNavegador() };
}

/** Trigger nuevo y con la forma mínima válida para el tipo elegido (descarta lo del tipo anterior,
 *  igual que el `.strict()` del backend exigiría). */
export function triggerPorTipo(tipo: TipoTrigger, anterior?: ITriggerFlow): ITriggerFlow {
  switch (tipo) {
    case 'siempre':
    case 'primer_mensaje':
      return { tipo };
    case 'palabra_clave':
      return { tipo, palabras: anterior?.palabras ?? [] };
    case 'horario':
      return { tipo, horario: anterior?.horario ?? horarioPorDefecto() };
  }
}

/** Texto corto para el botón del editor: de un vistazo, cuándo arranca el flujo. */
export function resumenTrigger(trigger: ITriggerFlow): string {
  switch (trigger.tipo) {
    case 'siempre':
      return 'Cualquier mensaje';
    case 'primer_mensaje':
      return 'Primer mensaje';
    case 'palabra_clave': {
      const palabras = trigger.palabras ?? [];
      if (palabras.length === 0) return 'Sin palabras aún';
      const vista = palabras.slice(0, 2).join(', ');
      return palabras.length > 2 ? `${vista} +${palabras.length - 2}` : vista;
    }
    case 'horario': {
      const h = trigger.horario;
      if (!h) return 'Sin horario aún';
      return `${resumenDias(h.dias)} ${h.desde}–${h.hasta}`;
    }
  }
}

function resumenDias(dias: number[]): string {
  const orden = DIAS_SEMANA.filter((d) => dias.includes(d.valor));
  if (orden.length === 0) return 'Sin días';
  if (orden.length === 7) return 'Todos los días';
  const contiguos = orden.every((d, i) => i === 0 || DIAS_SEMANA.indexOf(d) === DIAS_SEMANA.indexOf(orden[i - 1]!) + 1);
  if (contiguos && orden.length > 2) return `${orden[0]!.largo.slice(0, 3)}–${orden[orden.length - 1]!.largo.slice(0, 3)}`;
  return orden.map((d) => d.largo.slice(0, 3)).join(', ');
}

/** Primer problema que impediría guardar, o `null` si el trigger es válido. Espeja lo que exige
 *  el backend (`flow.validation.ts`) para avisar antes de enviar en vez de devolver un 400. */
export function validarTrigger(trigger: ITriggerFlow): string | null {
  if (trigger.tipo === 'palabra_clave' && (trigger.palabras ?? []).length === 0) {
    return 'Agrega al menos una palabra al disparador.';
  }
  if (trigger.tipo === 'horario') {
    const h = trigger.horario;
    if (!h || h.dias.length === 0) return 'Elige al menos un día para el horario del disparador.';
    if (!(h.desde < h.hasta)) return 'En el horario del disparador, la hora de inicio debe ser anterior a la de fin.';
  }
  return null;
}
