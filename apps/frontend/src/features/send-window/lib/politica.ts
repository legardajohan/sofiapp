import {
  diaSemanaDeFecha,
  fechaLocal,
  localAUtc,
  sumarDias,
} from './zona-horaria.js';
import {
  HORIZONTE_DIAS,
  type CategoriaEnvio,
  type Excepcion,
  type Franja,
  type FranjaDia,
  type PoliticaVentana,
  type ResultadoVentana,
} from '../types.js';

/**
 * ESPEJO de `apps/backend/src/features/send-window/send-window.policy.ts`: si cambia allí, cambia
 * aquí. Sirve para validar en línea y avisar antes de guardar; la decisión final es del servidor.
 *
 * Política de ventanas de envío (HU-CONF-01). PURA: sin Mongo, sin reloj (el instante llega por
 * argumento) y sin estado. Todo lo que depende de la zona pasa por `zona-horaria.util`.
 *
 * Modelo de un día local:
 * - Si hay una **excepción** aplicable a la categoría en esa fecha, manda ella sobre el día
 *   entero (00:00–24:00): `cerrado` → nada abierto; `franjas` → solo esas franjas.
 * - Si no, las **franjas semanales** de ese día de la semana, más la cola de las franjas del día
 *   anterior que cruzan la medianoche (la franja pertenece al día en que EMPIEZA). La cola solo
 *   aplica si el día anterior no tenía excepción: una excepción reemplaza el día completo, cola
 *   incluida.
 */

const MINUTOS_DIA = 1440;
const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

type Intervalo = [number, number];

/** `HH:mm` → minutos desde las 00:00 (`24:00` → 1440). */
export function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

function aHhmm(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

function ordenarYFusionar(intervalos: Intervalo[]): Intervalo[] {
  const orden = [...intervalos].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const fusion: Intervalo[] = [];
  for (const [a, b] of orden) {
    const ultimo = fusion[fusion.length - 1];
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else fusion.push([a, b]);
  }
  return fusion;
}

interface TramoSemanal {
  ini: number;
  fin: number;
  /** Índice de la franja de origen y día en que empieza: para mensajes de error legibles. */
  franja: number;
  dia: number;
}

function tramosSemanales(franjas: Franja[]): TramoSemanal[] {
  const tramos: TramoSemanal[] = [];
  franjas.forEach((f, franja) => {
    const desde = aMinutos(f.desde);
    const hasta = aMinutos(f.hasta);
    for (const dia of f.dias) {
      const base = dia * MINUTOS_DIA;
      if (desde < hasta) {
        tramos.push({ ini: base + desde, fin: base + hasta, franja, dia });
      } else if (desde > hasta) {
        tramos.push({ ini: base + desde, fin: base + MINUTOS_DIA, franja, dia });
        // Vuelta del sábado al domingo sobre el anillo semanal.
        const siguiente = ((dia + 1) % 7) * MINUTOS_DIA;
        if (hasta > 0) tramos.push({ ini: siguiente, fin: siguiente + hasta, franja, dia });
      }
    }
  });
  return tramos;
}

/**
 * Franjas semanales en minutos de la semana (`0..10080`, 0 = domingo 00:00). Una franja que cruza
 * la medianoche se parte en dos tramos; la del sábado vuelve al domingo.
 */
export function normalizarFranjas(franjas: Franja[]): Intervalo[] {
  return tramosSemanales(franjas).map((t): Intervalo => [t.ini, t.fin]);
}

/** Solapes entre franjas semanales de una misma regla, como mensajes legibles. */
export function validarSolapes(franjas: Franja[]): string[] {
  const tramos = tramosSemanales(franjas).sort((a, b) => a.ini - b.ini);
  const errores = new Set<string>();
  for (let i = 0; i < tramos.length; i++) {
    for (let j = i + 1; j < tramos.length; j++) {
      const a = tramos[i]!;
      const b = tramos[j]!;
      if (b.ini >= a.fin) break;
      const dia = NOMBRES_DIA[Math.floor(b.ini / MINUTOS_DIA) % 7];
      errores.add(
        a.franja === b.franja
          ? `La franja ${a.franja + 1} se solapa consigo misma el ${dia}.`
          : `Las franjas ${Math.min(a.franja, b.franja) + 1} y ${Math.max(a.franja, b.franja) + 1} se solapan el ${dia}.`,
      );
    }
  }
  return [...errores];
}

/** Solapes entre las franjas de un solo día (las de una excepción). */
export function validarSolapesDia(franjas: FranjaDia[]): string[] {
  const tramos = franjas
    .map((f, i) => ({ ini: aMinutos(f.desde), fin: aMinutos(f.hasta), i }))
    .sort((a, b) => a.ini - b.ini);
  const errores: string[] = [];
  for (let k = 1; k < tramos.length; k++) {
    const prev = tramos[k - 1]!;
    const cur = tramos[k]!;
    if (cur.ini < prev.fin) {
      errores.push(`Las franjas ${Math.min(prev.i, cur.i) + 1} y ${Math.max(prev.i, cur.i) + 1} se solapan.`);
    }
  }
  return errores;
}

function excepcionAplicable(
  config: PoliticaVentana,
  categoria: CategoriaEnvio,
  fecha: string,
): Excepcion | undefined {
  return config.excepciones.find(
    (e) => e.fecha === fecha && (!e.categorias?.length || e.categorias.includes(categoria)),
  );
}

/** Intervalos abiertos (minutos `0..1440` desde las 00:00 locales) de una fecha local. */
function intervalosDelDia(
  config: PoliticaVentana,
  categoria: CategoriaEnvio,
  franjas: Franja[],
  fecha: string,
): Intervalo[] {
  const excepcion = excepcionAplicable(config, categoria, fecha);
  if (excepcion) {
    if (excepcion.tipo === 'cerrado') return [];
    return ordenarYFusionar(
      (excepcion.franjas ?? []).map((f): Intervalo => {
        const desde = aMinutos(f.desde);
        const hasta = aMinutos(f.hasta);
        return [desde, hasta > desde ? hasta : MINUTOS_DIA];
      }),
    );
  }

  const dia = diaSemanaDeFecha(fecha);
  const anteriorTieneExcepcion = excepcionAplicable(config, categoria, sumarDias(fecha, -1)) !== undefined;
  const intervalos: Intervalo[] = [];
  for (const t of tramosSemanales(franjas)) {
    const inicioDia = dia * MINUTOS_DIA;
    if (t.ini < inicioDia || t.fin > inicioDia + MINUTOS_DIA) continue;
    // Un tramo que empieza a las 00:00 y viene del día anterior es la cola de una franja nocturna.
    if (t.dia !== dia && anteriorTieneExcepcion) continue;
    intervalos.push([t.ini - inicioDia, t.fin - inicioDia]);
  }
  return ordenarYFusionar(intervalos);
}

/**
 * Tramos abiertos como instantes UTC (ms), desde la fecha local `desde` hasta el horizonte,
 * fusionando los contiguos (una franja que acaba a las 24:00 y otra que empieza a las 00:00 del
 * día siguiente son un solo tramo abierto). Perezoso: el camino habitual solo mira hoy.
 */
function* tramosAbiertos(
  config: PoliticaVentana,
  categoria: CategoriaEnvio,
  franjas: Franja[],
  desde: string,
): Generator<Intervalo> {
  let pendiente: Intervalo | null = null;
  for (let d = 0; d <= HORIZONTE_DIAS; d++) {
    const fecha = sumarDias(desde, d);
    for (const [a, b] of intervalosDelDia(config, categoria, franjas, fecha)) {
      const ini = localAUtc(fecha, aHhmm(a), config.zonaHoraria).getTime();
      const fin = localAUtc(fecha, aHhmm(b), config.zonaHoraria).getTime();
      if (fin <= ini) continue;
      if (pendiente && ini <= pendiente[1]) {
        pendiente[1] = Math.max(pendiente[1], fin);
        continue;
      }
      if (pendiente) yield pendiente;
      pendiente = [ini, fin];
    }
  }
  if (pendiente) yield pendiente;
}

/**
 * ¿Puede salir ahora un envío de esta categoría? Fuera de franja devuelve la siguiente apertura
 * dentro del horizonte (`null` si no hay ninguna en `HORIZONTE_DIAS` días); dentro, el siguiente
 * cierre (`null` si sigue abierto hasta el horizonte o la categoría es libre).
 */
export function evaluarVentana(
  config: PoliticaVentana,
  categoria: CategoriaEnvio,
  ahora: Date,
): ResultadoVentana {
  if (!config.activo) return { permitido: true, siguienteCierre: null };
  const regla = config.reglas.find((r) => r.categoria === categoria);
  if (!regla || regla.modo === 'libre') return { permitido: true, siguienteCierre: null };

  const t = ahora.getTime();
  const hoy = fechaLocal(ahora, config.zonaHoraria);
  const finHorizonte = localAUtc(sumarDias(hoy, HORIZONTE_DIAS + 1), '00:00', config.zonaHoraria).getTime();
  const motivo = excepcionAplicable(config, categoria, hoy) ? 'excepcion' : 'fuera_de_franja';

  for (const [ini, fin] of tramosAbiertos(config, categoria, regla.franjas, hoy)) {
    if (fin <= t) continue;
    if (ini <= t) {
      return { permitido: true, siguienteCierre: fin >= finHorizonte ? null : new Date(fin) };
    }
    return { permitido: false, siguienteApertura: new Date(ini), motivo };
  }
  return { permitido: false, siguienteApertura: null, motivo };
}

/** Siguiente apertura a partir de `ahora` (`ahora` mismo si ya está abierto). */
export function siguienteApertura(
  config: PoliticaVentana,
  categoria: CategoriaEnvio,
  ahora: Date,
): Date | null {
  const r = evaluarVentana(config, categoria, ahora);
  return r.permitido ? ahora : r.siguienteApertura;
}

/** Siguiente cierre a partir de `ahora` (`null` si está cerrado o abierto hasta el horizonte). */
export function siguienteCierre(
  config: PoliticaVentana,
  categoria: CategoriaEnvio,
  ahora: Date,
): Date | null {
  const r = evaluarVentana(config, categoria, ahora);
  return r.permitido ? r.siguienteCierre : null;
}
