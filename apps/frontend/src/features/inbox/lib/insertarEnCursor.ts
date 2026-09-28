/**
 * Inserta `inserto` en `valor` reemplazando el rango `[inicio, fin)` —la selección del textarea— y
 * devuelve el texto nuevo y la posición del cursor justo detrás de lo insertado (HU-OMNI-07).
 *
 * Función pura a propósito: la parte difícil de "insertar el emoji donde está el cursor" no es el
 * DOM, son los bordes (cursor al principio, selección invertida, índices fuera de rango), y aquí se
 * prueban sin montar nada.
 *
 * Los índices son de `selectionStart`/`selectionEnd`, que el navegador da en **unidades UTF-16**,
 * igual que `String.prototype.slice`: por eso insertar junto a un emoji compuesto (👩🏽‍💻) no lo
 * parte. El navegador nunca coloca el cursor en mitad de un grafema.
 */
export function insertarEnCursor(
  valor: string,
  inicio: number | null,
  fin: number | null,
  inserto: string,
): { valor: string; cursor: number } {
  // Sin selección conocida (el textarea nunca tuvo foco): al final, que es donde el asesor espera.
  const a = clamp(inicio ?? valor.length, valor.length);
  const b = clamp(fin ?? a, valor.length);
  const [desde, hasta] = a <= b ? [a, b] : [b, a];

  return {
    valor: valor.slice(0, desde) + inserto + valor.slice(hasta),
    cursor: desde + inserto.length,
  };
}

function clamp(n: number, max: number): number {
  return Math.min(Math.max(0, n), max);
}
