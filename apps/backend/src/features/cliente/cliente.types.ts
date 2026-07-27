import { Document, Types } from 'mongoose';

export type CanalOrigen = 'whatsapp' | 'instagram' | 'messenger' | 'formulario' | 'web';
export type EstadoComercial =
  | 'nuevo'
  | 'en_gestion'
  | 'pago_pendiente'
  | 'pagado'
  | 'perdido';

export interface ICliente {
  tenantId: Types.ObjectId;
  metaUserId: string;
  telefono: string;
  nombre?: string;
  canalOrigen: CanalOrigen;
  estadoComercial: EstadoComercial;
  ventana24hExpiraEn?: Date;
  ultimoMensajeAt?: Date;
  noLeidos: number;
  iaHabilitada: boolean;
  asesorId?: Types.ObjectId;
  customFields: Record<string, unknown>;
  /** Etiquetas de empresa aplicadas a la conversación (HU-OMNI-04). */
  tagIds: Types.ObjectId[];
  nivelInteres?: 'frio' | 'tibio' | 'caliente';
  objecionPrincipal?: 'precio' | 'tiempo' | 'confianza' | 'otra';
  rolContacto?: 'decisor' | 'usuario' | 'desconocido';
  interesItemId?: Types.ObjectId;
}

export interface IClienteDocument extends ICliente, Document {}
