import { Types } from 'mongoose';
import { logger } from '../utils/logger.js';
import { Semaforo } from '../features/semaforo/semaforo.model.js';
import { Tenant } from '../features/tenant/tenant.model.js';

/**
 * Semaforización comercial de fábrica de los leads (HU-CRM-04).
 *
 * Las `key` son **exactamente** los cuatro slugs de `docs/domain.md` §5, los mismos que
 * `Tag.semaforo`. No es cosmético: es lo que permite sincronizar el semáforo del lead con la
 * etiqueta de su conversación y lo que IA-05 y MARK-01 resolverán. Por eso estos cuatro se marcan
 * `esDefecto: true` y el service impide archivarlos, a diferencia de los que cree la empresa.
 *
 * Los `label` describen el eje del **lead** (resultado comercial), no el de la conversación (salud
 * del hilo): ver la tabla de los dos ejes en `docs/domain.md` §5.
 *
 * El orden cuenta un recorrido —frío → potencial → venta concretada— y deja el descarte al final.
 */
export const SEMAFOROS_DEFECTO: { key: string; label: string; color: string }[] = [
  { key: 'azul', label: 'Frío', color: '#2563EB' },
  { key: 'naranja', label: 'Potencial', color: '#EA580C' },
  { key: 'verde', label: 'Venta concretada', color: '#16A34A' },
  { key: 'rojo', label: 'Descartado', color: '#DC2626' },
];

export async function seedSemaforos(tenantId: string | Types.ObjectId): Promise<void> {
  const oid = typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId;

  const tenant = await Tenant.findById(oid, { semaforosSeeded: 1 }).lean();
  if (tenant?.semaforosSeeded === true) return;

  // `$setOnInsert`: volver a sembrar no pisa el renombrado ni el recoloreado del administrador.
  for (const [orden, semaforo] of SEMAFOROS_DEFECTO.entries()) {
    await Semaforo.updateOne(
      { tenantId: oid, key: semaforo.key },
      { $setOnInsert: { tenantId: oid, ...semaforo, orden, activo: true, esDefecto: true } },
      { upsert: true },
    );
  }

  // Se marca al final: si la siembra falla a medias, el siguiente arranque la reintenta.
  await Tenant.updateOne({ _id: oid }, { $set: { semaforosSeeded: true } });
}

/**
 * Siembra los tenants que ya existían antes de este feature. Se llama al arrancar, igual que los
 * backfill de etiquetas, opciones de contacto y estados.
 */
export async function backfillSemaforos(): Promise<void> {
  const pendientes = await Tenant.find({ semaforosSeeded: { $ne: true } }, { _id: 1 }).lean();
  if (pendientes.length === 0) return;

  for (const tenant of pendientes) {
    try {
      await seedSemaforos(tenant._id as Types.ObjectId);
    } catch (err) {
      logger.error('backfillSemaforos falló para un tenant', {
        tenantId: String(tenant._id),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info(`backfillSemaforos: sembrados ${pendientes.length} tenants.`);
}
