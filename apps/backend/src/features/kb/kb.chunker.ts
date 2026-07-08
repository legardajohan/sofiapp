/**
 * Trocea un texto en fragmentos de `size` caracteres con `overlap` de solape entre
 * fragmentos consecutivos. Función pura (sin efectos): entrada → salida determinista.
 */
export function chunkText(texto: string, size: number, overlap: number): string[] {
  if (size <= 0) throw new Error('size debe ser mayor que 0');
  if (overlap < 0) throw new Error('overlap no puede ser negativo');
  if (overlap >= size) throw new Error('overlap debe ser menor que size');

  const clean = texto.trim();
  if (clean.length === 0) return [];
  if (clean.length <= size) return [clean];

  const chunks: string[] = [];
  const step = size - overlap;
  for (let start = 0; start < clean.length; start += step) {
    chunks.push(clean.slice(start, start + size));
    if (start + size >= clean.length) break;
  }
  return chunks;
}
