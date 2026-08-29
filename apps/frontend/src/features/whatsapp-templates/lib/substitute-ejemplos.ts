/** Sustituye cada `{{n}}` por el ejemplo en esa posición; deja el placeholder si no hay ejemplo. */
export function substituteEjemplos(cuerpo: string, ejemplos: string[]): string {
  return cuerpo.replace(/\{\{(\d+)\}\}/g, (match, indexStr: string) => {
    const valor = ejemplos[Number(indexStr) - 1];
    return valor && valor.length > 0 ? valor : match;
  });
}
