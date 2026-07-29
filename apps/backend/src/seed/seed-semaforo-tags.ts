import { Types } from 'mongoose';
import { logger } from '../utils/logger.js';
import { Tag } from '../features/tag/tag.model.js';
import { Tenant } from '../features/tenant/tenant.model.js';
import type { SemaforoSlug } from '../features/tag/tag.types.js';

/**
 * Semaforización (HU-OMNI-04): cuatro etiquetas de sistema con significado fijo, base de CRM-04,
 * IA-05 y MARK-01. El administrador puede renombrarlas y recolorearlas; el campo `semaforo` no
 * cambia, y es por él que los otros módulos las resuelven. Ver `docs/domain.md`.
 */
const SEMAFORO: { semaforo: SemaforoSlug; nombre: string; color: string }[] = [
  { semaforo: 'verde', nombre: 'Avanza', color: '#16A34A' },
  { semaforo: 'naranja', nombre: 'Requiere atención', color: '#EA580C' },
  { semaforo: 'rojo', nombre: 'En riesgo', color: '#DC2626' },
  { semaforo: 'azul', nombre: 'Informativo', color: '#2563EB' },
];

/**
 * Siembra las etiquetas de semáforo de UN tenant, **una sola vez en su vida**.
 *
 * La marca `Tenant.semaforoTagsSeeded` no es una optimización: es lo único que distingue "este
 * tenant nunca las tuvo" de "el administrador las borró a propósito". Un `upsert` no puede
 * diferenciar los dos casos, así que sin la marca cada arranque resucitaría con nombre y color de
 * fábrica una etiqueta que alguien eliminó deliberadamente. `$setOnInsert` sigue protegiendo el
 * renombrado y el recoloreado dentro de la única siembra.
 */
export async function seedSemaforoTags(tenantId: string | Types.ObjectId): Promise<void> {
  const oid = typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId;

  const tenant = await Tenant.findById(oid, { semaforoTagsSeeded: 1 }).lean();
  if (tenant?.semaforoTagsSeeded === true) return;

  for (const tag of SEMAFORO) {
    await Tag.updateOne(
      { tenantId: oid, semaforo: tag.semaforo },
      { $setOnInsert: { tenantId: oid, ...tag } },
      { upsert: true },
    );
  }

  // Se marca al final: si la siembra falla a medias, el siguiente arranque la reintenta.
  await Tenant.updateOne({ _id: oid }, { $set: { semaforoTagsSeeded: true } });
}

/**
 * Backfill para los tenants que ya existían antes de HU-OMNI-04. Las etiquetas son por tenant, así
 * que no cabe una semilla global como la de planes: hay que recorrerlos. Los ya sembrados quedan
 * fuera de la consulta, de modo que el coste tiende a cero y los borrados del administrador
 * sobreviven a los despliegues.
 */
export async function backfillSemaforoTags(): Promise<void> {
  const tenants = await Tenant.find({ semaforoTagsSeeded: { $ne: true } }, { _id: 1 }).lean();
  for (const tenant of tenants) {
    await seedSemaforoTags(tenant._id as Types.ObjectId);
  }
  logger.info('Seed de etiquetas de semaforización verificado.', { sembrados: tenants.length });
}
