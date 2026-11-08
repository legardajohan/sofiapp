import { aMinutos, validarSolapes, validarSolapesDia } from './politica.js';
import {
  CATEGORIAS_ENVIO,
  MAX_EXCEPCIONES,
  MAX_FRANJAS_POR_REGLA,
  type CategoriaEnvio,
  type Franja,
  type FranjaDia,
  type PoliticaVentana,
} from '../types.js';

/**
 * Validación en línea de la página de horarios. Espejo de `send-window.validation.ts` (Zod) del
 * backend: mismas reglas y mismos mensajes, para que lo que la página deja guardar sea lo que el
 * servidor acepta.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Franjas de una regla agrupadas por día de la semana: así las edita la página. */
export type FranjasPorDia = Record<number, FranjaDia[]>;

export function esHoraInicio(v: string): boolean {
  return HHMM.test(v);
}

export function esHoraFin(v: string): boolean {
  return HHMM.test(v) || v === '24:00';
}

/** `desde > hasta` (y el fin no es la medianoche justa): la franja termina al día siguiente. */
export function cruzaMedianoche(f: FranjaDia): boolean {
  if (!esHoraInicio(f.desde) || !esHoraFin(f.hasta)) return false;
  if (f.hasta === '00:00' || f.hasta === '24:00') return false;
  return aMinutos(f.desde) > aMinutos(f.hasta);
}

export function porDia(franjas: Franja[]): FranjasPorDia {
  const res: FranjasPorDia = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const f of franjas) {
    for (const d of f.dias) res[d]?.push({ desde: f.desde, hasta: f.hasta });
  }
  for (const lista of Object.values(res)) lista.sort((a, b) => a.desde.localeCompare(b.desde));
  return res;
}

/**
 * Vuelve a la forma del API agrupando los días con el mismo horario en una sola franja: lun–sáb
 * 08:00–19:00 es UNA franja, no seis. Así el tope de 10 franjas por categoría cuenta horarios
 * distintos, que es lo que el admin tiene en la cabeza.
 */
export function agrupar(dias: FranjasPorDia): Franja[] {
  const grupos = new Map<string, Franja>();
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    for (const f of dias[d] ?? []) {
      const clave = `${f.desde}-${f.hasta}`;
      const g = grupos.get(clave);
      if (g) {
        if (!g.dias.includes(d)) g.dias.push(d);
      } else {
        grupos.set(clave, { dias: [d], desde: f.desde, hasta: f.hasta });
      }
    }
  }
  return [...grupos.values()];
}

export interface ErrorFranja {
  desde?: string;
  hasta?: string;
}

export function errorDeFranja(f: FranjaDia, enExcepcion = false): ErrorFranja {
  const err: ErrorFranja = {};
  if (!esHoraInicio(f.desde)) err.desde = 'Usa HH:mm (00:00–23:59).';
  if (!esHoraFin(f.hasta)) err.hasta = 'Usa HH:mm (00:00–24:00).';
  if (err.desde || err.hasta) return err;
  if (f.desde === f.hasta) err.hasta = 'El inicio y el fin no pueden ser iguales.';
  else if (enExcepcion && aMinutos(f.hasta) <= aMinutos(f.desde)) {
    err.hasta = 'En una excepción el fin debe ser posterior al inicio.';
  }
  return err;
}

const sinError = (e: ErrorFranja): boolean => !e.desde && !e.hasta;

export interface ErroresPolitica {
  /** Problemas de cada regla en conjunto (solapes, tope de franjas). */
  reglas: Partial<Record<CategoriaEnvio, string[]>>;
  /** Problemas de cada excepción, por índice. */
  excepciones: Record<number, string[]>;
  general: string[];
  /** ¿Algún error, incluidos los de formato de cada franja? */
  hayErrores: boolean;
}

export function validarPolitica(p: PoliticaVentana): ErroresPolitica {
  const reglas: ErroresPolitica['reglas'] = {};
  const excepciones: ErroresPolitica['excepciones'] = {};
  const general: string[] = [];
  let formato = false;

  if (!p.zonaHoraria) general.push('Elige una zona horaria.');

  for (const r of p.reglas) {
    const errores: string[] = [];
    if (r.franjas.length > MAX_FRANJAS_POR_REGLA) {
      errores.push(`Máximo ${MAX_FRANJAS_POR_REGLA} horarios distintos por categoría.`);
    }
    if (r.franjas.every((f) => sinError(errorDeFranja(f)))) errores.push(...validarSolapes(r.franjas));
    else formato = true;
    if (errores.length) reglas[r.categoria] = errores;
  }

  if (p.excepciones.length > MAX_EXCEPCIONES) general.push(`Máximo ${MAX_EXCEPCIONES} excepciones.`);
  const fechas = new Set<string>();
  p.excepciones.forEach((e, i) => {
    const errores: string[] = [];
    if (fechas.has(e.fecha)) errores.push('Ya hay otra excepción para esta fecha.');
    fechas.add(e.fecha);
    if (e.tipo === 'franjas') {
      const franjas = e.franjas ?? [];
      if (franjas.length === 0) errores.push('Indica al menos una franja.');
      if (franjas.every((f) => sinError(errorDeFranja(f, true)))) errores.push(...validarSolapesDia(franjas));
      else formato = true;
    }
    if (errores.length) excepciones[i] = errores;
  });

  const hayErrores =
    formato ||
    general.length > 0 ||
    Object.keys(reglas).length > 0 ||
    Object.keys(excepciones).length > 0;
  return { reglas, excepciones, general, hayErrores };
}

/** Regla restringida sin ninguna franja: esa categoría no saldría nunca. Aviso, no error. */
export function categoriasSiempreCerradas(p: PoliticaVentana): CategoriaEnvio[] {
  return CATEGORIAS_ENVIO.filter((c) => {
    const r = p.reglas.find((x) => x.categoria === c);
    return r?.modo === 'restringido' && r.franjas.length === 0;
  });
}

/** Errores 400 del backend (`body.reglas.3.franjas`) llevados a la categoría que los causó. */
export function erroresDelServidor(
  errores: Array<{ path: string; message: string }>,
  enviada: PoliticaVentana,
): { reglas: Partial<Record<CategoriaEnvio, string[]>>; general: string[] } {
  const reglas: Partial<Record<CategoriaEnvio, string[]>> = {};
  const general: string[] = [];
  for (const e of errores) {
    const m = /^body\.reglas\.(\d+)/.exec(e.path);
    const categoria = m ? enviada.reglas[Number(m[1])]?.categoria : undefined;
    if (categoria) (reglas[categoria] ??= []).push(e.message);
    else general.push(e.message);
  }
  return { reglas, general };
}
