import { Document, Types } from 'mongoose';
import type { IMessageResponse, IPaginated } from '../conversation/conversation.types.js';
import type { ITagResponse } from '../tag/tag.types.js';

export type CanalOrigen = 'whatsapp' | 'instagram' | 'messenger' | 'formulario' | 'web';

/**
 * Fuente única del pipeline comercial: la usan el enum de Mongoose y el tipo, así que no pueden
 * divergir. `Lead.estado` (HU-CRM-01) la reutiliza en vez de declarar etapas propias.
 */
export const ESTADOS_COMERCIALES = [
  'nuevo',
  'en_gestion',
  'pago_pendiente',
  'pagado',
  'perdido',
] as const;

export type EstadoComercial = (typeof ESTADOS_COMERCIALES)[number];

/**
 * Datos de contacto extraídos por IA desde la conversación, bajo demanda (HU-OMNI-03).
 * Se guardan aparte de `nombre`/`telefono` a propósito: esos campos son la identidad real que
 * llega por WhatsApp y no deben pisarse con una inferencia del modelo. Cada campo es `null`
 * cuando la conversación no lo menciona.
 */
export interface IDatosExtraidos {
  nombreCompleto: string | null;
  correo: string | null;
  /** Nunca es `null`: si la conversación no dicta ninguno, cae al número de WhatsApp del contacto. */
  telefono: string;
  /** De dónde salió `telefono`. Opcional por extracciones guardadas antes de existir este campo. */
  telefonoOrigen?: TelefonoOrigen;
  extraidoAt: Date;
  modelo: string;
}

/** `conversacion` = el cliente lo dictó en un mensaje; `whatsapp` = es el número desde el que escribe. */
export type TelefonoOrigen = 'conversacion' | 'whatsapp';

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
  /** Etiquetas de empresa aplicadas a la conversación (HU-OMNI-04). */
  tagIds: Types.ObjectId[];
  nivelInteres?: 'frio' | 'tibio' | 'caliente';
  objecionPrincipal?: 'precio' | 'tiempo' | 'confianza' | 'otra';
  rolContacto?: 'decisor' | 'usuario' | 'desconocido';
  interesItemId?: Types.ObjectId;
  resumenIA?: IResumenIA;
  datosExtraidos?: IDatosExtraidos;
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
  /** Etiquetas hidratadas (HU-OMNI-04): la ficha pinta chips con color, no cadenas sueltas. */
  tags: ITagResponse[];
  asesorId: string | null;
  ultimoMensajeAt: string | null;
  createdAt: string;
  /** Lead al que ya se convirtió este contacto, o `null` (HU-CRM-01). */
  leadId: string | null;
}

/** Datos de contacto extraídos por IA, tal como los consume la ficha. */
export interface IDatosExtraidosResponse {
  nombreCompleto: string | null;
  correo: string | null;
  telefono: string;
  telefonoOrigen: TelefonoOrigen;
  extraidoAt: string;
}

/** Historial completo del contacto: ficha + resumen + datos extraídos + mensajes paginados. */
export interface IContactHistoryResponse {
  contacto: IContactCardResponse;
  resumen: IResumenResponse | null;
  datosExtraidos: IDatosExtraidosResponse | null;
  mensajes: IPaginated<IMessageResponse>;
}
