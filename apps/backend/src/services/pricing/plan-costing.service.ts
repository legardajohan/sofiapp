import { getVigente } from '../../features/exchange-rate/exchange-rate.service.js';
import { getSettings } from '../../features/platform-settings/platform-settings.service.js';
import { listCostItems } from '../../features/cost-catalog/cost-catalog.service.js';
import { calcularCosteo, type CostoItemInput } from './pricing.service.js';
import { convertirUsdACop, redondearComercial, type Moneda } from './money.util.js';
import type { IFotografiaFinanciera } from '../../features/plan/plan.types.js';

// Orquesta la fotografía financiera: reúne TRM vigente + settings + catálogo de costos y llama al
// motor de costeo puro. Si NO hay TRM (UNAVAILABLE), devuelve null: NO se bloquea la creación de
// planes ni la contratación (la fotografía simplemente no se genera hasta que exista una tasa).

const UNIT_ADMIN = 'administrador';

export async function construirFotografiaFinanciera(input: {
  administradores: number;
  precioUsd: number; // el precio comercial se define en USD; el COP se deriva con la TRM
}): Promise<IFotografiaFinanciera | null> {
  const vigente = await getVigente();
  if (!vigente.tasa) return null; // UNAVAILABLE → sin fotografía, sin bloquear

  const trmOficial = vigente.tasa.tasaCopPorUsd;
  const settings = await getSettings();
  const costItems = await listCostItems({ active: true });

  // Costo por administrador: primer concepto activo con unit='administrador' (o 0 si no existe).
  const adminItem = costItems.find((c) => c.unit === UNIT_ADMIN);
  const costoUnitarioAdmin = {
    currency: (adminItem?.currency ?? 'COP') as Moneda,
    valor: adminItem?.unitCostOriginal ?? adminItem?.fixedCostOriginal ?? '0',
  };

  const otrosCostos: CostoItemInput[] = costItems
    .filter((c) => c.unit !== UNIT_ADMIN)
    .map((c) => ({
      concepto: c.concepto,
      currency: c.currency,
      unitCostOriginal: c.unitCostOriginal,
      fixedCostOriginal: c.fixedCostOriginal,
    }));

  const costeo = calcularCosteo({
    administradores: input.administradores,
    costoUnitarioAdmin,
    costItems: otrosCostos,
    trmOficial,
    proteccionCambiariaPct: settings.proteccionCambiariaPct,
    utilidadPct: settings.utilidadPorDefectoPct,
  });

  // El precio final se define en USD; el COP se deriva con la TRM oficial.
  const precioFinalUsd = String(input.precioUsd);
  const precioFinalCop = redondearComercial(
    convertirUsdACop(precioFinalUsd, trmOficial),
    2,
  ).toString();

  return {
    trmOficial: costeo.trmOficial,
    fechaVigenciaTrm: vigente.tasa.fechaVigencia,
    proteccionCambiariaPct: costeo.proteccionCambiariaPct,
    tasaEfectiva: costeo.tasaEfectiva,
    subtotalAdministradoresCop: costeo.subtotalAdministradoresCop,
    costosUnitarios: costeo.costosUnitarios,
    costoOperativoCop: costeo.costoOperativoCop,
    utilidadPct: costeo.utilidadPct,
    precioSugeridoCop: costeo.precioSugeridoCop,
    precioSugeridoUsd: costeo.precioSugeridoUsd,
    precioFinalCop,
    precioFinalUsd,
  };
}
