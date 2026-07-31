import type { Paginated } from '@/features/inbox/types';

/** Atributo tal como lo edita el formulario: sin `oculto`, que es una marca de solo lectura. */
export interface AtributoInput {
  key: string;
  label: string;
  valor: string;
  sensible: boolean;
}

/**
 * Parche de la ficha. `undefined` = no se toca; `null` = se borra. Es la misma semántica que aplica
 * el backend, así que el formulario solo manda lo que cambió.
 */
export interface ContactPatchPayload {
  nombre?: string | null;
  correo?: string | null;
  documento?: string | null;
  nivelInteres?: 'frio' | 'tibio' | 'caliente' | null;
  objecionPrincipal?: 'precio' | 'tiempo' | 'confianza' | 'otra' | null;
  rolContacto?: 'decisor' | 'usuario' | 'desconocido' | null;
  atributos?: AtributoInput[];
}

export interface NotaDTO {
  id: string;
  texto: string;
  autor: { id: string; nombre: string | null };
  createdAt: string;
}

export type NotasPage = Paginated<NotaDTO>;
