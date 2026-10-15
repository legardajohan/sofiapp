import type { CampoContacto, ParametroDinamico } from '../types.js';

/** Cómo se nombra cada variable en la interfaz: por lo que es, no por el campo del modelo. */
export const ETIQUETA_VARIABLE: Record<CampoContacto, string> = {
  nombre: 'Nombre del contacto',
  telefono: 'Teléfono del contacto',
};

/** Un trozo del cuerpo de la plantilla: texto tal cual, o una variable que se resuelve al enviar. */
export interface SegmentoCuerpo {
  texto: string;
  variable: CampoContacto | null;
}

/**
 * Parte el cuerpo en texto y variables para la vista previa (HU-MARK-05).
 *
 * La variable se muestra por su nombre ("Nombre del contacto") y no por el texto de respaldo: lo
 * que hay que ver al revisar es que ahí irá el dato de cada persona. Un `{{n}}` sin valor queda
 * literal, igual que en `substituteEjemplos`.
 */
export function segmentarCuerpo(
  cuerpo: string,
  parametros: readonly string[],
  dinamicos: readonly ParametroDinamico[] = [],
): SegmentoCuerpo[] {
  const variablePorIndice = new Map(dinamicos.map((d) => [d.indice, d.campo]));
  const segmentos: SegmentoCuerpo[] = [];
  let ultimo = 0;

  for (const match of cuerpo.matchAll(/\{\{(\d+)\}\}/g)) {
    const inicio = match.index ?? 0;
    if (inicio > ultimo) segmentos.push({ texto: cuerpo.slice(ultimo, inicio), variable: null });

    const indice = Number(match[1]) - 1;
    const variable = variablePorIndice.get(indice) ?? null;
    const valor = parametros[indice];
    segmentos.push(
      variable
        ? { texto: ETIQUETA_VARIABLE[variable], variable }
        : { texto: valor && valor.length > 0 ? valor : match[0], variable: null },
    );
    ultimo = inicio + match[0].length;
  }

  if (ultimo < cuerpo.length) segmentos.push({ texto: cuerpo.slice(ultimo), variable: null });
  return segmentos;
}
