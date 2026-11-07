import type { TagDTO } from '@/features/tags/types';
import type { EtiquetaEnvio } from '../types.js';

/**
 * Estado del campo de etiqueta. `null` = no etiquetar. En `existente`, `tag: null` = la persona
 * eligió «Usar una existente» pero todavía no marcó cuál: el envío no se habilita hasta que lo haga.
 */
export type ValorEtiqueta =
  | { modo: 'nueva'; nombre: string }
  | { modo: 'existente'; tag: TagDTO | null }
  | null;

/** Del estado del campo a lo que viaja en `POST /:id/send`. `undefined` = nada válido que mandar. */
export function aEtiquetaEnvio(valor: ValorEtiqueta): EtiquetaEnvio | undefined {
  if (!valor) return undefined;
  if (valor.modo === 'existente') return valor.tag ? { tagId: valor.tag.id } : undefined;
  const nombre = valor.nombre.trim();
  return nombre ? { nombre } : undefined;
}
