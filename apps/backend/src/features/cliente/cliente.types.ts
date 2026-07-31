import { Document, Types } from 'mongoose';
import type { IMessageResponse, IPaginated } from '../conversation/conversation.types.js';
import type { ITagResponse } from '../tag/tag.types.js';

export type CanalOrigen = 'whatsapp' | 'instagram' | 'messenger' | 'formulario' | 'web';
export type EstadoComercial =
  | 'nuevo'
  | 'en_gestion'
  | 'pago_pendiente'
  | 'pagado'
  | 'perdido';

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

export type NivelInteres = 'frio' | 'tibio' | 'caliente';
export type ObjecionPrincipal = 'precio' | 'tiempo' | 'confianza' | 'otra';
export type RolContacto = 'decisor' | 'usuario' | 'desconocido';

/**
 * Atributo personalizado del contacto (HU-CRM-02). No reutiliza `customFields` —un
 * `Record<string, unknown>` plano— porque este necesita dos cosas que aquel no puede dar sin
 * romper su tipo declarado: el metadato `sensible` por campo y el **orden** en que el asesor los
 * creó. `customFields` queda superado; no se migra porque hoy vale `{}` en todos los documentos.
 */
export interface IAtributoPersonalizado {
  /** Slug estable derivado del label al crearlo; no cambia aunque el label se renombre. */
  key: string;
  label: string;
  /** Cifrado (con marcador `enc:v1:`) cuando `sensible` es `true`. */
  valor: string;
  sensible: boolean;
}

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
  nivelInteres?: NivelInteres;
  objecionPrincipal?: ObjecionPrincipal;
  rolContacto?: RolContacto;
  interesItemId?: Types.ObjectId;
  resumenIA?: IResumenIA;
  datosExtraidos?: IDatosExtraidos;
  // ─── Datos sensibles (HU-CRM-02) — cifrados en reposo, nunca indexados ───────
  /** Correo registrado a mano por el asesor. Sufijo `Enc` como `MetaIntegration.accessTokenEnc`. */
  correoEnc?: string;
  /** Documento de identidad. */
  documentoEnc?: string;
  atributos: IAtributoPersonalizado[];
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
  // ─── Datos sensibles (HU-CRM-02) ────────────────────────────────────────────
  /** En claro para los subroles autorizados; enmascarado (`d••••@dominio.com`) para el resto. */
  correo: string | null;
  /** En claro o enmascarado (`••••1234`) con la misma regla. */
  documento: string | null;
  atributos: IAtributoResponse[];
  /**
   * Lo que la UI necesita para saber qué está mirando sin tener que deducirlo del formato del
   * valor. Sin esto no podría distinguir un correo enmascarado de uno que casualmente lo parece.
   */
  puedeVerSensibles: boolean;
}

/** Atributo tal como lo consume la ficha: `oculto` marca los que llegaron enmascarados. */
export interface IAtributoResponse {
  key: string;
  label: string;
  valor: string;
  sensible: boolean;
  oculto: boolean;
}

/**
 * Parche de la ficha (HU-CRM-02). Semántica explícita: un campo **ausente** no se toca; un campo
 * enviado como **`null`** se borra. Sin esa distinción no habría forma de vaciar un dato mal
 * escrito. `atributos` viaja completo (reemplazo, no merge): es una lista corta que la UI edita de
 * golpe, y un merge por `key` obligaría a inventar una semántica de borrado que el array ya tiene.
 */
export interface UpdateClienteDTO {
  nombre?: string | null;
  correo?: string | null;
  documento?: string | null;
  nivelInteres?: NivelInteres | null;
  objecionPrincipal?: ObjecionPrincipal | null;
  rolContacto?: RolContacto | null;
  atributos?: IAtributoPersonalizado[];
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
