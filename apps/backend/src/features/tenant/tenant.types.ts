import type { Document, Types } from 'mongoose';

export type EstadoTenant = 'activo' | 'suspendido' | 'prueba';

export interface ICampoCaptura {
  key: string;
  label: string;
  tipo: 'string' | 'number' | 'enum';
  opciones?: string[];
}

export interface ITenant {
  nombre: string;
  slug: string;
  nit?: string;
  contacto: { email: string; telefono: string };
  estado: EstadoTenant;
  planId?: Types.ObjectId;
  camposCaptura: ICampoCaptura[];
}

export interface ITenantDocument extends ITenant, Document {}
