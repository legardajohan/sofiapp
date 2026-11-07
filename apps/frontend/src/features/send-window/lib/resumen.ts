import { ORDEN_DIAS, type Franja, type ModoRegla } from '../types.js';

const ABREV = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** «Lun–Sáb» / «Lun, Mié, Vie»: días consecutivos (de lunes a domingo) se comprimen en rango. */
function resumenDias(dias: number[]): string {
  const orden: readonly number[] = ORDEN_DIAS;
  // Posiciones (0 = lunes … 6 = domingo) de los días elegidos, agrupadas en tramos consecutivos.
  const posiciones = orden.flatMap((d, i) => (dias.includes(d) ? [i] : []));
  const tramos: number[][] = [];
  for (const p of posiciones) {
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo[ultimo.length - 1] === p - 1) ultimo.push(p);
    else tramos.push([p]);
  }
  const abrev = (p: number): string => ABREV[orden[p]!]!;
  return tramos
    .map((t) => (t.length > 2 ? `${abrev(t[0]!)}–${abrev(t[t.length - 1]!)}` : t.map(abrev).join(', ')))
    .join(', ');
}

export function resumenFranjas(modo: ModoRegla, franjas: Franja[]): string {
  if (modo === 'libre') return 'Sin restricción';
  if (franjas.length === 0) return 'Nunca';
  if (franjas.length === 1 && franjas[0]!.dias.length === 7 && franjas[0]!.desde === '00:00' && franjas[0]!.hasta === '24:00') {
    return 'Todo el día';
  }
  const partes = franjas.map((f) => `${resumenDias(f.dias)} ${f.desde}–${f.hasta}`);
  return partes.length > 2 ? `${partes.slice(0, 2).join(' · ')} y ${partes.length - 2} más` : partes.join(' · ');
}
