import { Types } from 'mongoose';
import { PaymentEvent } from './payment-event.model.js';
import type {
  RegistrarEventoDTO,
  RegistrarEventoResult,
  ResultadoProcesoEvento,
} from './billing.types.js';

/*
 * EXCEPCIÓN DOCUMENTADA (ADR 0022 · multi-tenancy.md §5.8): `payment_events` es una colección
 * GLOBAL y append-only. Un evento de Wompi llega antes de saber de qué tenant es, así que no hay
 * `tenantId` con el que usar `*Scoped`. Este archivo es el único que toca el modelo, y no expone
 * borrado ni edición del contenido: solo registrar y marcar como procesado.
 */

function esDuplicado(err: unknown): boolean {
  const e = err as { code?: number } | null;
  return !!e && e.code === 11000;
}

/** Idempotente: la misma `claveIdempotencia` devuelve `{ nuevo: false }` sin lanzar. */
export async function registrarEvento(datos: RegistrarEventoDTO): Promise<RegistrarEventoResult> {
  try {
    const doc = await PaymentEvent.create({ ...datos, recibidoEn: new Date() });
    return { nuevo: true, eventoId: doc._id.toString() };
  } catch (err) {
    if (esDuplicado(err)) return { nuevo: false };
    throw err;
  }
}

/** Solo escribe si el evento aún no se procesó; devuelve si esta llamada fue la que lo hizo. */
export async function marcarEventoProcesado(
  eventoId: string,
  r: ResultadoProcesoEvento,
): Promise<boolean> {
  const res = await PaymentEvent.updateOne(
    { _id: eventoId, procesadoEn: null },
    {
      $set: {
        procesadoEn: new Date(),
        resultado: r.resultado,
        tenantId: r.tenantId ? new Types.ObjectId(r.tenantId) : null,
        paymentId: r.paymentId ? new Types.ObjectId(r.paymentId) : null,
      },
    },
  );
  return res.modifiedCount === 1;
}
