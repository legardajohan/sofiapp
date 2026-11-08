import { Types } from 'mongoose';
import { aggregateScoped } from '../repositories/base.repository.js';
import { logger } from '../utils/logger.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { Tenant } from '../features/tenant/tenant.model.js';
import { registrarCamposHeredados } from '../features/contact-field/contact-field.service.js';

interface AtributoAgrupado {
  _id: string;
  label: string;
  sensible: boolean;
}

/**
 * Backfill idempotente del catálogo de campos personalizados (HU-FLOW-05).
 *
 * Por cada tenant, cada `key` distinta presente en `Cliente.atributos` que no esté en el catálogo se
 * registra con el primer `label` encontrado y `sensible: true` si lo fue en algún contacto. Correrlo
 * dos veces no duplica ni modifica nada. Todo pasa por el repositorio con alcance de tenant: el
 * backfill de un tenant nunca crea campos en otro.
 */
export async function backfillContactFields(): Promise<void> {
  const tenants = await Tenant.find({}, { _id: 1 }).lean();
  let creados = 0;
  for (const tenant of tenants) {
    creados += await backfillContactFieldsDeTenant(tenant._id as Types.ObjectId);
  }
  logger.info('Backfill de campos personalizados verificado.', { tenants: tenants.length, creados });
}

export async function backfillContactFieldsDeTenant(tenantId: Types.ObjectId): Promise<number> {
  const filas = await aggregateScoped<AtributoAgrupado>(Cliente, tenantId, [
    { $unwind: '$atributos' },
    {
      $group: {
        _id: '$atributos.key',
        label: { $first: '$atributos.label' },
        sensible: { $max: '$atributos.sensible' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return registrarCamposHeredados(
    tenantId,
    filas.map((f) => ({ key: f._id, label: f.label, sensible: Boolean(f.sensible) })),
  );
}
