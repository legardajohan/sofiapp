import { Document, Types } from 'mongoose';
import type { IMessageResponse, IPaginated } from '../conversation/conversation.types.js';

export type CanalOrigen = 'whatsapp' | 'instagram' | 'messenger' | 'formulario' | 'web';
export type EstadoComercial =
  | 'nuevo'
  | 'en_gestion'
  | 'pago_pendiente'
  | 'pagado'
  | 'perdido';

/** Resumen por IA de la conversación, persistido en el cliente (HU-OMNI-03). */
export interface IResumenIA {
  texto: string;
  generadoAt: Date;
  /** `ultimoMensajeAt` del cliente al generar el resumen; base para calcular si quedó desactualizado. */
  mensajesHasta: Date;
  modelo: string;
}

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
  tags: string[];
  nivelInteres?: 'frio' | 'tibio' | 'caliente';
  objecionPrincipal?: 'precio' | 'tiempo' | 'confianza' | 'otra';
  rolContacto?: 'decisor' | 'usuario' | 'desconocido';
  interesItemId?: Types.ObjectId;
  resumenIA?: IResumenIA;
}

export interface IClienteDocument extends ICliente, Document {}

// ─── DTOs de respuesta (HU-OMNI-03) ─────────────────────────────────────────────

/** Estado del resumen para la ficha del contacto. `desactualizado` se deriva de `ultimoMensajeAt`. */
export interface IResumenResponse {
  texto: string;
  generadoAt: string;
  desactualizado: boolean;
}

/** Ficha del contacto (solo lectura) para el panel lateral de la bandeja. */
export interface IContactCardResponse {
  id: string;
  nombre: string | null;
  telefono: string;
  canalOrigen: string;
  estadoComercial: string;
  nivelInteres: string | null;
  objecionPrincipal: string | null;
  rolContacto: string | null;
  tags: string[];
  asesorId: string | null;
  ultimoMensajeAt: string | null;
  createdAt: string;
}

/** Historial completo del contacto: ficha + resumen + mensajes paginados. */
export interface IContactHistoryResponse {
  contacto: IContactCardResponse;
  resumen: IResumenResponse | null;
  mensajes: IPaginated<IMessageResponse>;
}
