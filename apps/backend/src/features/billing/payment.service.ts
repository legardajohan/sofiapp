import { Types } from 'mongoose';
import { Decimal } from 'decimal.js';
import type { EstadoPago } from '@sofiapp/shared';
import {
  createScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findOneScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { IVA_PCT, aCentavos, desglosarIva } from '../../services/pricing/money.util.js';
import { Payment } from './payment.model.js';
import { esTerminal } from './payment.estado.js';
import { generarReferencia } from './payment.reference.js';
import { aPaymentResponse } from './billing.mappers.js';
import type {
  ContextoTransicion,
  CrearPagoPendienteDTO,
  IPayment,
  IPaymentResponse,
  ITransicionResult,
} from './billing.types.js';

type PagoLean = IPayment & { _id: Types.ObjectId };

const MAX_INTENTOS_REFERENCIA = 3;
const MAX_DETALLE = 500;

interface ErrorDuplicado {
  code?: number;
  keyPattern?: Record<string, unknown>;
}

function esDuplicado(err: unknown, campo: string): boolean {
  const e = err as ErrorDuplicado | null;
  return !!e && e.code === 11000 && !!e.keyPattern && campo in e.keyPattern;
}

/**
 * Crea el intento en PENDIENTE. El monto sale de `precioTotalCop` (del plan, nunca del cliente);
 * la referencia es aleatoria. Un segundo PENDIENTE del tenant lo rechaza el índice único parcial.
 */
export async function crearPagoPendiente(
  tenantId: string,
  dto: CrearPagoPendienteDTO,
): Promise<IPaymentResponse> {
  const amountInCents = aCentavos(dto.precioTotalCop);
  const { baseCop, ivaCop } = desglosarIva(dto.precioTotalCop);
  const totalCop = new Decimal(dto.precioTotalCop).toFixed(2);

  for (let intento = 1; intento <= MAX_INTENTOS_REFERENCIA; intento += 1) {
    try {
      const doc = await createScoped(Payment, tenantId, {
        reference: generarReferencia(),
        amountInCents,
        currency: 'COP',
        planId: new Types.ObjectId(dto.planId),
        planVersion: dto.planVersion,
        periodo: dto.periodo,
        precio: {
          totalCop: Types.Decimal128.fromString(totalCop),
          baseCop: Types.Decimal128.fromString(baseCop),
          ivaCop: Types.Decimal128.fromString(ivaCop),
          ivaPct: IVA_PCT,
        },
        estado: 'PENDIENTE',
        aceptaciones: dto.aceptaciones,
        expiraEn: dto.expiraEn,
        intentadoPor: new Types.ObjectId(dto.intentadoPor),
      });
      return aPaymentResponse(doc.toObject() as unknown as PagoLean);
    } catch (err) {
      if (esDuplicado(err, 'estado')) {
        throw new AppError('Ya hay un pago pendiente', 409);
      }
      if (esDuplicado(err, 'reference') && intento < MAX_INTENTOS_REFERENCIA) continue;
      throw err;
    }
  }
  throw new AppError('No se pudo generar una referencia de pago', 500);
}

export async function obtenerPago(tenantId: string, paymentId: string): Promise<IPaymentResponse> {
  if (!Types.ObjectId.isValid(paymentId)) throw new AppError('Pago no encontrado', 404);
  const doc = await findByIdScoped(Payment, tenantId, paymentId).lean<PagoLean>().exec();
  if (!doc) throw new AppError('Pago no encontrado', 404);
  return aPaymentResponse(doc);
}

export async function obtenerPagoPorReferencia(
  tenantId: string,
  reference: string,
): Promise<IPaymentResponse> {
  const doc = await findOneScoped(Payment, tenantId, { reference }).lean<PagoLean>().exec();
  if (!doc) throw new AppError('Pago no encontrado', 404);
  return aPaymentResponse(doc);
}

/**
 * Único camino de transición (webhook, conciliación y consulta). Escritura condicional sobre
 * `estado: 'PENDIENTE'`: de dos procesos concurrentes solo gana uno (patrón de ADR 0020 §6).
 *
 * No decide si el monto coincide (D4) ni activa la suscripción: eso lo orquestan HT-PAY-02 y
 * HU-BILL-03 llamando a esta función.
 */
export async function transicionarPago(
  tenantId: string,
  paymentId: string,
  hacia: EstadoPago,
  ctx: ContextoTransicion,
): Promise<ITransicionResult> {
  if (!esTerminal(hacia)) {
    throw new AppError('El destino de la transición debe ser un estado terminal', 400);
  }
  if (!Types.ObjectId.isValid(paymentId)) throw new AppError('Pago no encontrado', 404);

  const cambios: Record<string, unknown> = {
    estado: hacia,
    finalizadoEn: new Date(),
    origenTransicion: ctx.origen,
  };
  if (ctx.providerTransactionId !== undefined) {
    cambios.providerTransactionId = ctx.providerTransactionId;
  }
  if (ctx.metodo !== undefined) cambios.metodo = ctx.metodo;
  if (ctx.detalleProveedor !== undefined) {
    cambios.detalleProveedor = ctx.detalleProveedor.slice(0, MAX_DETALLE);
  }

  let aplicado: PagoLean | null;
  try {
    aplicado = await findOneAndUpdateScoped(
      Payment,
      tenantId,
      { _id: paymentId, estado: 'PENDIENTE' },
      { $set: cambios },
      { new: true },
    )
      .lean<PagoLean>()
      .exec();
  } catch (err) {
    if (esDuplicado(err, 'providerTransactionId')) {
      throw new AppError('La transacción ya está asociada a otro pago', 409);
    }
    throw err;
  }
  if (aplicado) return { resultado: 'aplicada', pago: aPaymentResponse(aplicado) };

  const actual = await findByIdScoped(Payment, tenantId, paymentId).lean<PagoLean>().exec();
  if (!actual) throw new AppError('Pago no encontrado', 404);
  return {
    resultado: actual.estado === hacia ? 'sin_cambio' : 'rechazada',
    pago: aPaymentResponse(actual),
  };
}
