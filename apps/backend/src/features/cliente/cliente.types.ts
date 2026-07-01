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
  asesorId?: Types.ObjectId;
  customFields: Record<string, unknown>;
  tags: string[];
  nivelInteres?: 'frio' | 'tibio' | 'caliente';
  objecionPrincipal?: 'precio' | 'tiempo' | 'confianza' | 'otra';
  rolContacto?: 'decisor' | 'usuario' | 'desconocido';
  interesItemId?: Types.ObjectId;
}

export interface IClienteDocument extends ICliente, Document {}
