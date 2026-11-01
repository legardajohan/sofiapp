import type { Document, Types } from 'mongoose';

/**
 * Identificador estable de las etiquetas de semaforización. El administrador puede renombrarlas y
 * recolorearlas, pero este campo no cambia: es el handle por el que CRM-04, IA-05 y MARK-01 las
 * resuelven. Referirse a ellas por nombre sería frágil, porque el nombre es editable.
 */
export type SemaforoSlug = 'azul' | 'rojo' | 'naranja' | 'verde';

export const SEMAFORO_SLUGS: readonly SemaforoSlug[] = ['azul', 'rojo', 'naranja', 'verde'];

/**
 * De dónde salió la etiqueta (HU-MARK-07). `campana` = la generó el envío de una campaña para
 * marcar a sus destinatarios; `manual` = la creó una persona. Es informativo: ambas se usan igual.
 */
export const ORIGENES_TAG = ['manual', 'campana'] as const;
export type OrigenTag = (typeof ORIGENES_TAG)[number];

/** Tope del nombre. 60 y no 30: `Campaña {nombre} - {fecha}` no cabía (HU-MARK-07). */
export const TAG_NOMBRE_MAX = 60;

export interface ITag {
  tenantId: Types.ObjectId;
  nombre: string;
  /** Color en formato `#RRGGBB`. Es dato del tenant, no un token de diseño (ver spec HU-OMNI-04). */
  color: string;
  /** Presente solo en las cuatro etiquetas sembradas; `undefined` en las creadas por el usuario. */
  semaforo?: SemaforoSlug;
  /** Ausente en las etiquetas anteriores a HU-MARK-07: se leen como `manual`. */
  origen?: OrigenTag;
  /** Campaña que la generó, si `origen === 'campana'`. */
  campaignId?: Types.ObjectId | null;
}

export interface ITagDocument extends ITag, Document {}

export interface CreateTagDTO {
  nombre: string;
  color: string;
}

export interface UpdateTagDTO {
  nombre?: string;
  color?: string;
}

export interface ITagResponse {
  id: string;
  nombre: string;
  color: string;
  semaforo: SemaforoSlug | null;
  origen: OrigenTag;
  campaignId: string | null;
}
