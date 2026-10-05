export const ESTADOS_PLANTILLA = ['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED'] as const;
export type EstadoPlantilla = (typeof ESTADOS_PLANTILLA)[number];

export const CATEGORIAS_PLANTILLA = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
export type CategoriaPlantilla = (typeof CATEGORIAS_PLANTILLA)[number];

/** Formato de la cabecera. `IMAGE` es la única que el programador de campañas sabe rellenar. */
export type FormatoCabecera = 'NINGUNA' | 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';

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
  obsoleta: boolean;
  syncedAt: string;
}
