export type EstadoTenant = 'activo' | 'suspendido' | 'prueba';

export interface ITenant {
  _id: string;
  nombre: string;
  slug: string;
  nit?: string;
  contacto: { email: string; telefono: string };
  estado: EstadoTenant;
  planId?: string;
  createdAt: string;
  updatedAt: string;
}
