/**
 * Clave estable de un atributo personalizado, derivada de su etiqueta.
 *
 * Se calcula **al guardar**, no mientras se teclea: derivarla en cada pulsación la fijaría a partir
 * de la primera letra ("Colegio" → `c`), porque a partir de ahí ya habría una clave y no se
 * recalcularía. Una vez guardada no vuelve a cambiar, aunque se renombre la etiqueta: si cambiara,
 * el atributo dejaría de ser el mismo dato entre guardados.
 */
export function slugificar(label: string, usados: string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'campo';

  if (!usados.includes(base)) return base;
  let n = 2;
  while (usados.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
