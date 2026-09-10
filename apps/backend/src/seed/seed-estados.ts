import { Types } from 'mongoose';
import { logger } from '../utils/logger.js';
import { Estado } from '../features/estado/estado.model.js';
import { Tenant } from '../features/tenant/tenant.model.js';

/**
 * Pipeline de fábrica de los leads (HU-CRM-03).
 *
 * Las `key` son **exactamente** los valores que antes eran el `enum` `ESTADOS_COMERCIALES`. No es
 * cosmético: los leads que ya tienen `estado: 'en_gestion'` grabado siguen resolviendo su etiqueta
 * contra esta semilla, así que el paso de enum a catálogo **no necesita migrar un solo documento**.
 *
 * Son un punto de partida, no estructura: el administrador los renombra, los recolorea y añade los
 * suyos.
 */
export const ESTADOS_DEFECTO: { key: string; label: string; color: string }[] = [
  { key: 'nuevo', label: 'Nuevo', color: '#64748B' },
  { key: 'en_gestion', label: 'En gestión', color: '#2563EB' },
  { key: 'pago_pendiente', label: 'Pago pendiente', color: '#D97706' },
  { key: 'pagado', label: 'Pagado', color: '#16A34A' },
  { key: 'perdido', label: 'Perdido', color: '#DC2626' },
];

export async function seedEstados(tenantId: string | Types.ObjectId): Promise<void> {
  const oid = typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId;

  const tenant = await Tenant.findById(oid, { estadosSeeded: 1 }).lean();
  if (tenant?.estadosSeeded === true) return;

  // El índice del array fija el orden del pipeline: 'nuevo' → 'pagado' se lee como un recorrido, y
  // ordenarlos alfabéticamente ('En gestión' primero) lo destruiría.
  for (const [orden, estado] of ESTADOS_DEFECTO.entries()) {
    await Estado.updateOne(
      { tenantId: oid, key: estado.key },
      { $setOnInsert: { tenantId: oid, ...estado, orden, activo: true, esDefecto: true } },
      { upsert: true },
    );
  }

  // Se marca al final: si la siembra falla a medias, el siguiente arranque la reintenta.
  await Tenant.updateOne({ _id: oid }, { $set: { estadosSeeded: true } });
}

/**
 * Siembra los tenants que ya existían antes de este feature. Se llama al arrancar, igual que los
 * backfill de etiquetas y de opciones de contacto.
 */
export async function backfillEstados(): Promise<void> {
  const pendientes = await Tenant.find({ estadosSeeded: { $ne: true } }, { _id: 1 }).lean();
  if (pendientes.length === 0) return;

  for (const tenant of pendientes) {
    try {
      await seedEstados(tenant._id as Types.ObjectId);
    } catch (err) {
      logger.error('backfillEstados falló para un tenant', {
        tenantId: String(tenant._id),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info(`backfillEstados: sembrados ${pendientes.length} tenants.`);
}
