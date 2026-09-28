export type EstadoTenant = 'activo' | 'suspendido' | 'prueba';

export interface ITenant {
  _id: string;
  nombre: string;
  slug: string;
  nit?: string;
  contacto: { email: string; telefono: string };
  estado: EstadoTenant;
  planId?: string;
  /** Límite de las notas de voz de los asesores (HU-OMNI-07), ya resuelto con los defaults. */
  notasDeVoz?: { maxDuracionSegundos: number; maxBytes: number };
  createdAt: string;
  updatedAt: string;
}
