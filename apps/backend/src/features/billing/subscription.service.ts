import { findOneScoped } from '../../repositories/base.repository.js';
import { Subscription } from './subscription.model.js';
import { SUSCRIPCION_SIN_PLAN, aSubscriptionResponse } from './billing.mappers.js';
import type { ISubscription, ISubscriptionResponse } from './billing.types.js';

/**
 * Lectura perezosa: un tenant sin documento está `sin_plan` y NO se escribe nada al preguntarlo.
 * Las escrituras (activar, marcar vencida) llegan con HU-BILL-03 y HT-PAY-03.
 */
export async function obtenerSuscripcion(tenantId: string): Promise<ISubscriptionResponse> {
  const doc = await findOneScoped(Subscription, tenantId).lean<ISubscription>().exec();
  return doc ? aSubscriptionResponse(doc) : { ...SUSCRIPCION_SIN_PLAN };
}
