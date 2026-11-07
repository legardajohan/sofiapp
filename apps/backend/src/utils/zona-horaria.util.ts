/**
 * Fechas en una zona horaria IANA arbitraria, sin dependencias: solo `Intl` (HU-MARK-07).
 *
 * `date-range.util.ts` trabaja en UTC y sirve para reportes que ya reciben el rango normalizado.
 * Aquí se resuelve lo que aquel no puede: "las 00:00 del 28 de octubre **en Bogotá**" como instante
 * UTC, respetando los cambios de horario de las zonas que los tienen.
 */

/** `true` si el runtime reconoce la zona (`America/Bogota`, `Europe/Madrid`…). */
export function esZonaValida(zona: string): boolean {
  if (!zona) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

interface PartesFecha {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

function partesEnZona(fecha: Date, zona: string): PartesFecha {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(fecha);
  const valor = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(partes.find((p) => p.type === tipo)?.value ?? '0');
  return {
    anio: valor('year'),
    mes: valor('month'),
    dia: valor('day'),
    hora: valor('hour'),
    minuto: valor('minute'),
    segundo: valor('second'),
  };
}

/** Desfase de `zona` respecto a UTC en el instante `fecha`, en ms (Bogotá → −5 h). */
function desfaseMs(fecha: Date, zona: string): number {
  const p = partesEnZona(fecha, zona);
  const comoUtc = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  const sinMs = fecha.getTime() - fecha.getUTCMilliseconds();
  return comoUtc - sinMs;
}

/** `YYYY-MM-DD` del día que marca el calendario de `zona` en el instante `fecha`. */
export function fechaEnZona(fecha: Date, zona: string): string {
  const p = partesEnZona(fecha, zona);
  return `${p.anio}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`;
}

/**
 * Instante UTC de una hora local de pared en `zona`. Se ajusta dos veces porque el desfase depende
 * del propio instante: alrededor de un cambio de horario la primera estimación cae del lado
 * equivocado.
 */
function instanteLocal(ymd: string, zona: string, h: number, m: number, s: number, ms: number): Date {
  const [anio, mes, dia] = ymd.split('-').map(Number) as [number, number, number];
  const pared = Date.UTC(anio, mes - 1, dia, h, m, s, ms);
  let estimado = pared - desfaseMs(new Date(pared), zona);
  estimado = pared - desfaseMs(new Date(estimado), zona);
  return new Date(estimado);
}

/** 00:00:00.000 del día `ymd` en `zona`, como instante UTC. */
export function inicioDelDiaEnZona(ymd: string, zona: string): Date {
  return instanteLocal(ymd, zona, 0, 0, 0, 0);
}

/** 23:59:59.999 del día `ymd` en `zona`, como instante UTC. */
export function finDelDiaEnZona(ymd: string, zona: string): Date {
  return instanteLocal(ymd, zona, 23, 59, 59, 999);
}

/** Días de calendario entre dos `YYYY-MM-DD`, ambos incluidos (`2026-10-01`→`2026-10-01` = 1). */
export function diasInclusivos(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}
