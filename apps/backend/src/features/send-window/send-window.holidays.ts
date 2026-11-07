import { diaSemanaDeFecha, sumarDias } from '../../utils/zona-horaria.util.js';
import type { IFestivoResponse } from './send-window.types.js';

/**
 * Festivos de Colombia (Ley 51 de 1983, «Ley Emiliani», y los derivados de Pascua). PURO.
 *
 * Tres familias:
 * - Fijos: se celebran el día que caen.
 * - Trasladables: si no caen en lunes, pasan al lunes siguiente.
 * - De Pascua: Jueves y Viernes Santo (fijos respecto a Pascua) y Ascensión, Corpus Christi y
 *   Sagrado Corazón (trasladados al lunes: Pascua + 43, + 64 y + 71 días).
 */

const fecha = (anio: number, mes: number, dia: number): string =>
  `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/** Domingo de Pascua (computus anónimo gregoriano, Meeus/Jones/Butcher). */
export function domingoDePascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return fecha(anio, mes, dia);
}

/** Lleva una fecha al lunes siguiente si no es lunes (Ley Emiliani). */
function alLunes(f: string): string {
  const dia = diaSemanaDeFecha(f);
  return dia === 1 ? f : sumarDias(f, (8 - dia) % 7);
}

export function festivosColombia(anio: number): IFestivoResponse[] {
  const pascua = domingoDePascua(anio);
  const festivos: IFestivoResponse[] = [
    { fecha: fecha(anio, 1, 1), motivo: 'Año Nuevo' },
    { fecha: alLunes(fecha(anio, 1, 6)), motivo: 'Día de los Reyes Magos' },
    { fecha: alLunes(fecha(anio, 3, 19)), motivo: 'Día de San José' },
    { fecha: sumarDias(pascua, -3), motivo: 'Jueves Santo' },
    { fecha: sumarDias(pascua, -2), motivo: 'Viernes Santo' },
    { fecha: fecha(anio, 5, 1), motivo: 'Día del Trabajo' },
    { fecha: sumarDias(pascua, 43), motivo: 'Ascensión del Señor' },
    { fecha: sumarDias(pascua, 64), motivo: 'Corpus Christi' },
    { fecha: sumarDias(pascua, 71), motivo: 'Sagrado Corazón' },
    { fecha: alLunes(fecha(anio, 6, 29)), motivo: 'San Pedro y San Pablo' },
    { fecha: fecha(anio, 7, 20), motivo: 'Día de la Independencia' },
    { fecha: fecha(anio, 8, 7), motivo: 'Batalla de Boyacá' },
    { fecha: alLunes(fecha(anio, 8, 15)), motivo: 'Asunción de la Virgen' },
    { fecha: alLunes(fecha(anio, 10, 12)), motivo: 'Día de la Raza' },
    { fecha: alLunes(fecha(anio, 11, 1)), motivo: 'Todos los Santos' },
    { fecha: alLunes(fecha(anio, 11, 11)), motivo: 'Independencia de Cartagena' },
    { fecha: fecha(anio, 12, 8), motivo: 'Inmaculada Concepción' },
    { fecha: fecha(anio, 12, 25), motivo: 'Navidad' },
  ];
  return festivos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
