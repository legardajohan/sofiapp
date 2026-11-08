/**
 * ESPEJO de `apps/backend/src/utils/zona-horaria.util.ts`.
 *
 * Utilidades de hora local por zona IANA, sin dependencias: todo sale de `Intl.DateTimeFormat`,
 * que conoce los cambios de horario de verano de cada zona. La aritmética de offsets a mano se
 * equivoca dos veces al año.
 *
 * Las comparten el trigger `horario` de flujos (HU-FLOW-04) y la política de ventanas de envío
 * (HU-CONF-01).
 */

const DIAS_SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const MS_MINUTO = 60_000;

/** Construir un `DateTimeFormat` es caro y la política lo usa en cada envío: uno por zona. */
const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateador(zonaHoraria: string): Intl.DateTimeFormat {
  let f = formateadores.get(zonaHoraria);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zonaHoraria,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formateadores.set(zonaHoraria, f);
  }
  return f;
}

interface PartesLocales {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
  diaSemana: number;
}

function partesLocales(ahora: Date, zonaHoraria: string): PartesLocales {
  const partes = formateador(zonaHoraria).formatToParts(ahora);
  const valor = (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((p) => p.type === tipo)?.value ?? '';
  return {
    anio: Number(valor('year')),
    mes: Number(valor('month')),
    dia: Number(valor('day')),
    hora: Number(valor('hour')),
    minuto: Number(valor('minute')),
    segundo: Number(valor('second')),
    diaSemana: DIAS_SEMANA[valor('weekday')] ?? -1,
  };
}

const dosDigitos = (n: number): string => String(n).padStart(2, '0');

/** ¿La zona existe para `Intl`? Lo usa la validación Zod de la zona del tenant. */
export function esZonaHorariaValida(zonaHoraria: string): boolean {
  try {
    formateador(zonaHoraria);
    return true;
  } catch {
    return false;
  }
}

/** Día de la semana (0 = domingo) y hora `HH:mm` de `ahora` en la zona dada. */
export function momentoLocal(ahora: Date, zonaHoraria: string): { dia: number; hora: string } {
  const p = partesLocales(ahora, zonaHoraria);
  return { dia: p.diaSemana, hora: `${dosDigitos(p.hora)}:${dosDigitos(p.minuto)}` };
}

/** Fecha local `YYYY-MM-DD` de `ahora` en la zona dada. */
export function fechaLocal(ahora: Date, zonaHoraria: string): string {
  const p = partesLocales(ahora, zonaHoraria);
  return `${p.anio}-${dosDigitos(p.mes)}-${dosDigitos(p.dia)}`;
}

/** Diferencia (ms) entre la hora de pared de la zona y UTC en el instante `t`. */
function offsetEn(t: number, zonaHoraria: string): number {
  const p = partesLocales(new Date(t), zonaHoraria);
  const comoUtc = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return comoUtc - Math.floor(t / 1000) * 1000;
}

/**
 * Instante UTC de la hora de pared `hhmm` del día `fecha` (`YYYY-MM-DD`) en la zona dada.
 *
 * Dos pasadas: el offset en la conjetura ingenua puede ser el del otro lado de un cambio de
 * horario, así que se recalcula en el candidato. Si la hora pedida cae en el **hueco** del cambio
 * a verano (no existe en la pared), devuelve el primer instante válido tras el hueco. Si cae en el
 * **solape** del cambio a invierno (existe dos veces), devuelve la primera de las dos.
 *
 * `hhmm` admite `24:00` (medianoche del día siguiente).
 */
export function localAUtc(fecha: string, hhmm: string, zonaHoraria: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number) as [number, number, number];
  const [hora, minuto] = hhmm.split(':').map(Number) as [number, number];
  const pared = Date.UTC(anio, mes - 1, dia, hora, minuto);

  const offset1 = offsetEn(pared, zonaHoraria);
  const candidato1 = pared - offset1;
  const offset2 = offsetEn(candidato1, zonaHoraria);
  if (offset2 === offset1) {
    // Solape del cambio a invierno: la misma pared existe con el offset anterior (mayor). Se
    // prefiere la primera ocurrencia.
    const anterior = pared - offsetEn(candidato1 - 3 * 3_600_000, zonaHoraria);
    if (anterior < candidato1 && anterior + offsetEn(anterior, zonaHoraria) === pared) return new Date(anterior);
    return new Date(candidato1);
  }

  const candidato2 = pared - offset2;
  if (offsetEn(candidato2, zonaHoraria) === offset2) return new Date(candidato2);

  // Hueco del cambio a verano: ningún candidato reproduce la pared pedida. La transición está
  // entre los dos candidatos; se busca por bisección (a resolución de minuto) el primer instante
  // con el offset nuevo.
  let bajo = Math.min(candidato1, candidato2);
  let alto = Math.max(candidato1, candidato2);
  const offsetFinal = offsetEn(alto, zonaHoraria);
  while (alto - bajo > MS_MINUTO) {
    const medio = bajo + Math.floor((alto - bajo) / 2 / MS_MINUTO) * MS_MINUTO;
    if (offsetEn(medio, zonaHoraria) === offsetFinal) alto = medio;
    else bajo = medio;
  }
  return new Date(alto);
}

/** Suma `dias` a una fecha `YYYY-MM-DD` (calendario puro, sin zona). */
export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number) as [number, number, number];
  const d = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return `${d.getUTCFullYear()}-${dosDigitos(d.getUTCMonth() + 1)}-${dosDigitos(d.getUTCDate())}`;
}

/** Día de la semana (0 = domingo) de una fecha `YYYY-MM-DD` (calendario puro). */
export function diaSemanaDeFecha(fecha: string): number {
  const [anio, mes, dia] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
}
