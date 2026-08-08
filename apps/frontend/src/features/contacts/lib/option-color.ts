/**
 * Gama de colores de las opciones de la ficha (interés / objeción / rol).
 *
 * Los hex son **los mismos** que ofrece `TagColorPicker` para las etiquetas, a propósito: que el
 * rojo de "Caliente" y el rojo de una etiqueta en riesgo sean el mismo rojo es lo que hace que el
 * color signifique algo en todo el CRM en vez de ser decoración por pantalla. Lo que cambia es el
 * nombre de cada uno, porque aquí describen una escala de interés y no un semáforo de gestión.
 *
 * El cálculo del par fondo/texto NO se reimplementa: se reutiliza `tagColors`, que ya garantiza
 * 4.5:1 en claro y oscuro y tiene sus propios tests.
 */
export const GAMA_OPCIONES: { hex: string; nombre: string }[] = [
  { hex: '#DC2626', nombre: 'Rojo' },
  { hex: '#EA580C', nombre: 'Naranja' },
  { hex: '#CA8A04', nombre: 'Amarillo' },
  { hex: '#16A34A', nombre: 'Verde' },
  { hex: '#0891B2', nombre: 'Cian' },
  { hex: '#2563EB', nombre: 'Azul' },
  { hex: '#7C3AED', nombre: 'Violeta' },
  { hex: '#475569', nombre: 'Gris' },
];

/** El del `default` del schema: el que recibe una opción creada sin elegir color. */
export const COLOR_OPCION_DEFECTO = '#475569';

/** Nombre legible del color, para el `aria-label` del botón que lo elige. */
export function nombreDeColor(hex: string): string {
  const normalizado = hex.toUpperCase();
  return GAMA_OPCIONES.find((c) => c.hex === normalizado)?.nombre ?? 'Color personalizado';
}
