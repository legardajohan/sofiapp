import { Payment } from './payment.model.js';
import { esReferenciaValida } from './payment.reference.js';

/**
 * EXCEPCIÓN a "el `tenantId` nace del token" (regla 2 del CLAUDE.md · ADR 0022 ·
 * multi-tenancy.md §5.8). El webhook de Wompi no lleva JWT: el tenant se resuelve buscando el pago
 * por su `reference`, que es única global y aleatoria. Cumple aquí el papel de `phone_number_id`
 * en el webhook de Meta.
 *
 * Es la única lectura de `Payment` fuera del repositorio scoped y **solo devuelve identificadores**.
 * A partir de ahí, todo vuelve a pasar por `*Scoped` con ese `tenantId`.
 */
export async function resolverTenantPorReferencia(
  reference: string,
): Promise<{ tenantId: string; paymentId: string } | null> {
  if (!esReferenciaValida(reference)) return null;
  const doc = await Payment.findOne({ reference })
    .select({ _id: 1, tenantId: 1 })
    .lean<{ _id: { toString(): string }; tenantId: { toString(): string } }>()
    .exec();
  if (!doc) return null;
  return { tenantId: doc.tenantId.toString(), paymentId: doc._id.toString() };
}
