export const ESTADOS_PLANTILLA = [
  'APPROVED',
  'PENDING',
  'REJECTED',
  'PAUSED',
  'DISABLED',
  'IN_APPEAL',
] as const;
export type EstadoPlantilla = (typeof ESTADOS_PLANTILLA)[number];

export const CATEGORIAS_PLANTILLA = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
export type CategoriaPlantilla = (typeof CATEGORIAS_PLANTILLA)[number];

/** Meta solo admite imagen en la cabecera de estas categorías (HT-WA-04). */
export const CATEGORIAS_CON_IMAGEN: readonly CategoriaPlantilla[] = ['MARKETING', 'UTILITY'];

/** Formato de la cabecera. `IMAGE` es la única que el programador de campañas sabe rellenar. */
export type FormatoCabecera = 'NINGUNA' | 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';

/** Imagen por defecto de la plantilla, con URL firmada relativa al API (pasar por `apiUrl`). */
export interface IImagenPlantilla {
  url: string;
  mimeType: string;
  tamanoBytes: number;
}

export interface IMotivoRechazo {
  codigo: string;
  mensaje: string;
}

export interface IWhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: CategoriaPlantilla;
  status: EstadoPlantilla;
  cuerpo: string | null;
  ejemplos: string[];
  parametrosBody: number;
  cabecera: FormatoCabecera;
  pie: string | null;
  imagen: IImagenPlantilla | null;
  motivoRechazo: IMotivoRechazo | null;
  obsoleta: boolean;
  syncedAt: string;
}
