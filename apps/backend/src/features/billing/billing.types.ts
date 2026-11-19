import type { Document, Types } from 'mongoose';
import type {
  EstadoPago,
  EstadoPagoTerminal,
  EstadoSuscripcion,
  OrigenSuscripcion,
  PeriodoCobro,
} from '@sofiapp/shared';

/**
 * Dominio de la pasarela de pagos (HT-PAY-04, ADR 0021/0022). Este feature **no tiene controller ni
 * routes** a propósito: los endpoints `/api/billing/*` llegan con HU-BILL-02 y el webhook con
 * HT-PAY-02. Aquí solo hay modelos y funciones de dominio.
 */

export interface IAceptaciones {
  /** `presigned_acceptance.acceptance_token` de Wompi. */
  tokenAceptacionWompi: string;
  /** `presigned_personal_data_auth.acceptance_token` de Wompi. */
  tokenDatosPersonalesWompi: string;
  versionTerminosSofi: string;
  versionPoliticaDatos: string;
  aceptadoEn: Date;
  ip: string;
}

export type OrigenTransicion = 'webhook' | 'conciliacion' | 'consulta';

export interface ISubscription {
  tenantId: Types.ObjectId;
  estado: EstadoSuscripcion;
  planId: Types.ObjectId | null;
  planVersion: number | null;
  periodo: PeriodoCobro | null;
  vigenciaDesde: Date | null;
  vigenciaHasta: Date | null;
  origen: OrigenSuscripcion | null;
  ultimoPagoId: Types.ObjectId | null;
  /** Reservado para HU-BILL-04. */
  renovacionAutomatica: boolean;
}
export interface ISubscriptionDocument extends ISubscription, Document {}

export interface IPrecioPago {
  totalCop: Types.Decimal128;
  baseCop: Types.Decimal128;
  ivaCop: Types.Decimal128;
  ivaPct: string;
}

export interface IPayment {
  tenantId: Types.ObjectId;
  /** Opaca y aleatoria (D8); única global. */
  reference: string;
  providerTransactionId: string | null;
  /** Entero: lo que se firma y se cobra en Wompi. */
  amountInCents: number;
  currency: 'COP';
  planId: Types.ObjectId;
  planVersion: number;
  periodo: PeriodoCobro;
  /** Snapshot inmutable del precio (no retroactividad). */
  precio: IPrecioPago;
  estado: EstadoPago;
  /** `payment_method_type` de Wompi (CARD, PSE, NEQUI…). */
  metodo: string | null;
  detalleProveedor: string | null;
  aceptaciones: IAceptaciones;
  expiraEn: Date;
  /** userId del usuario principal (AUTH-05). */
  intentadoPor: Types.ObjectId;
  finalizadoEn: Date | null;
  origenTransicion: OrigenTransicion | null;
  createdAt: Date;
}
export interface IPaymentDocument extends IPayment, Document {}

export type ResultadoEvento =
  | 'aplicado'
  | 'sin_cambio'
  | 'rechazado_transicion'
  | 'monto_no_coincide'
  | 'referencia_desconocida'
  | 'requiere_revision'
  | 'error';

export const RESULTADOS_EVENTO: readonly ResultadoEvento[] = [
  'aplicado',
  'sin_cambio',
  'rechazado_transicion',
  'monto_no_coincide',
  'referencia_desconocida',
  'requiere_revision',
  'error',
];

/**
 * Log global append-only. No guarda el cuerpo crudo del evento (trae correo y teléfono del
 * pagador). `tenantId` es nulo hasta resolverse por referencia (ADR 0022).
 */
export interface IPaymentEvent {
  claveIdempotencia: string;
  evento: string;
  transaccionId: string | null;
  estadoReportado: string | null;
  reference: string | null;
  amountInCents: number | null;
  currency: string | null;
  entorno: 'test' | 'prod' | null;
  recibidoEn: Date;
  tenantId: Types.ObjectId | null;
  paymentId: Types.ObjectId | null;
  procesadoEn: Date | null;
  resultado: ResultadoEvento | null;
}
export interface IPaymentEventDocument extends IPaymentEvent, Document {}

// DTOs

export interface CrearPagoPendienteDTO {
  planId: string;
  planVersion: number;
  periodo: PeriodoCobro;
  /** Del plan (HU-BILL-01); nunca del cliente. String COP con IVA incluido. */
  precioTotalCop: string;
  aceptaciones: IAceptaciones;
  expiraEn: Date;
  intentadoPor: string;
}

export interface ContextoTransicion {
  origen: OrigenTransicion;
  providerTransactionId?: string;
  metodo?: string;
  detalleProveedor?: string;
}

export type ResultadoTransicion = 'aplicada' | 'sin_cambio' | 'rechazada';

export type DestinoTransicion = EstadoPagoTerminal;

export interface RegistrarEventoDTO {
  claveIdempotencia: string;
  evento: string;
  transaccionId: string | null;
  estadoReportado: string | null;
  reference: string | null;
  amountInCents: number | null;
  currency: string | null;
  entorno: 'test' | 'prod' | null;
}

export type RegistrarEventoResult = { nuevo: true; eventoId: string } | { nuevo: false };

export interface ResultadoProcesoEvento {
  tenantId: string | null;
  paymentId: string | null;
  resultado: ResultadoEvento;
}

export interface IPaymentResponse {
  _id: string;
  reference: string;
  estado: EstadoPago;
  amountInCents: number;
  currency: 'COP';
  planId: string;
  planVersion: number;
  periodo: PeriodoCobro;
  precio: { totalCop: string; baseCop: string; ivaCop: string; ivaPct: string };
  metodo: string | null;
  expiraEn: string;
  finalizadoEn: string | null;
  createdAt: string;
}

export interface ITransicionResult {
  resultado: ResultadoTransicion;
  pago: IPaymentResponse;
}

export interface ISubscriptionResponse {
  estado: EstadoSuscripcion;
  planId: string | null;
  planVersion: number | null;
  periodo: PeriodoCobro | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  origen: OrigenSuscripcion | null;
  ultimoPagoId: string | null;
  renovacionAutomatica: boolean;
}
