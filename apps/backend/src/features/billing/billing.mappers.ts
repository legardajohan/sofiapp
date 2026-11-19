import type {
  IPayment,
  IPaymentResponse,
  ISubscription,
  ISubscriptionResponse,
} from './billing.types.js';

type PagoLean = IPayment & { _id: { toString(): string } };

/** Decimal128 → string (ADR 0005 §3): el JSON nunca lleva dinero como `number`. */
export function aPaymentResponse(pago: PagoLean): IPaymentResponse {
  return {
    _id: pago._id.toString(),
    reference: pago.reference,
    estado: pago.estado,
    amountInCents: pago.amountInCents,
    currency: pago.currency,
    planId: pago.planId.toString(),
    planVersion: pago.planVersion,
    periodo: pago.periodo,
    precio: {
      totalCop: pago.precio.totalCop.toString(),
      baseCop: pago.precio.baseCop.toString(),
      ivaCop: pago.precio.ivaCop.toString(),
      ivaPct: pago.precio.ivaPct,
    },
    metodo: pago.metodo,
    expiraEn: pago.expiraEn.toISOString(),
    finalizadoEn: pago.finalizadoEn ? pago.finalizadoEn.toISOString() : null,
    createdAt: pago.createdAt.toISOString(),
  };
}

export const SUSCRIPCION_SIN_PLAN: ISubscriptionResponse = {
  estado: 'sin_plan',
  planId: null,
  planVersion: null,
  periodo: null,
  vigenciaDesde: null,
  vigenciaHasta: null,
  origen: null,
  ultimoPagoId: null,
  renovacionAutomatica: false,
};

export function aSubscriptionResponse(s: ISubscription): ISubscriptionResponse {
  return {
    estado: s.estado,
    planId: s.planId ? s.planId.toString() : null,
    planVersion: s.planVersion,
    periodo: s.periodo,
    vigenciaDesde: s.vigenciaDesde ? s.vigenciaDesde.toISOString() : null,
    vigenciaHasta: s.vigenciaHasta ? s.vigenciaHasta.toISOString() : null,
    origen: s.origen,
    ultimoPagoId: s.ultimoPagoId ? s.ultimoPagoId.toString() : null,
    renovacionAutomatica: s.renovacionAutomatica,
  };
}
