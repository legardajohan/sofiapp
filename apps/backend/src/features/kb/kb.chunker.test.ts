import { describe, it, expect } from 'vitest';
import { chunkText } from './kb.chunker.js';

describe('chunkText', () => {
  it('texto vacío o solo espacios → []', () => {
    expect(chunkText('', 100, 10)).toEqual([]);
    expect(chunkText('   \n  ', 100, 10)).toEqual([]);
  });

  it('texto más corto que size → un único chunk (trim)', () => {
    expect(chunkText('  hola mundo  ', 100, 10)).toEqual(['hola mundo']);
  });

  it('texto largo → varios chunks, cada uno ≤ size', () => {
    const texto = 'a'.repeat(2500);
    const chunks = chunkText(texto, 1000, 150);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
  });

  it('reconstrucción sin pérdida de contenido (respetando el solape)', () => {
    const texto = Array.from({ length: 3333 }, (_, i) => String.fromCharCode(97 + (i % 26))).join('');
    const size = 500;
    const overlap = 80;
    const chunks = chunkText(texto, size, overlap);

    let reconstruido = chunks[0] ?? '';
    for (let i = 1; i < chunks.length; i++) {
      reconstruido += chunks[i]!.slice(overlap);
    }
    expect(reconstruido).toBe(texto.trim());
  });

  it('chunks consecutivos comparten `overlap` caracteres', () => {
    const texto = 'x'.repeat(1200);
    const size = 500;
    const overlap = 100;
    const chunks = chunkText(texto, size, overlap);
    const finPrimero = chunks[0]!.slice(size - overlap);
    const inicioSegundo = chunks[1]!.slice(0, overlap);
    expect(finPrimero).toBe(inicioSegundo);
  });

  it('overlap ≥ size → error', () => {
    expect(() => chunkText('abc', 100, 100)).toThrow();
  });
});
