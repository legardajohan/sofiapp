import { Decimal } from 'decimal.js';
import { AppError } from '../../utils/AppError.js';
import {
  type Moneda,
  tasaEfectiva as calcTasaEfectiva,
  redondearComercial,
} from './money.util.js';

// Motor de costeo PURO (sin DB ni red): recibe todo por parámetro y es 100% testeable.
// La orquestación (leer TRM vigente, settings y catálogo) vive en los services de feature (Fase E).

export interface CostoItemInput {
  concepto: string;
  currency: Moneda;
  unitCostOriginal?: string; // costo por unidad (string decimal)
  fixedCostOriginal?: string; // costo fijo (string decimal)
  cantidad?: number; // multiplicador del costo unitario (default 1)
}

export interface CosteoInput {
  administradores: number;
  costoUnitarioAdmin: { currency: Moneda; valor: string };
  costItems: CostoItemInput[];
  trmOficial: string; // COP por USD (oficial)
  proteccionCambiariaPct: number; // 0..20
  utilidadPct: number;
}

// Snapshot por costo: conserva valor original, moneda, tasa usada y valor convertido (CA-23).
export interface CostoUnitarioSnapshot {
  concepto: string;
  currency: Moneda;
  valorOriginal: string;
  tasaUsada?: string; // solo para costos en USD (tasa efectiva)
  valorConvertidoCop: string;
}

export interface ResultadoCosteo {
  trmOficial: string;
  proteccionCambiariaPct: number;
  tasaEfectiva: string;
  subtotalAdministradoresCop: string;
  costosUnitarios: CostoUnitarioSnapshot[];
  costoOperativoCop: string;
  utilidadPct: number;
  precioSugeridoCop: string;
  precioSugeridoUsd: string;
}

/**
 * Calcula el costeo operativo y el precio sugerido (COP y USD) con precisión decimal.
 * - Costos USD → COP con la **tasa efectiva** (TRM × (1 + protección/100)).
 * - Precio USD con la **TRM oficial** (no la efectiva), para no inflar el equivalente en USD.
 * - Los costos individuales NO se redondean; solo el costo operativo y los precios (CA-17/22/23/26).
 */
export function calcularCosteo(input: CosteoInput): ResultadoCosteo {
  const trm = new Decimal(input.trmOficial);
  if (trm.lte(0)) {
    throw new AppError('No hay una TRM válida para calcular el costeo.', 422);
  }
  const tasaEf = calcTasaEfectiva(input.trmOficial, input.proteccionCambiariaPct);

  // Convierte un importe a COP según su moneda; USD usa la tasa EFECTIVA.
  const aCop = (currency: Moneda, valor: string): { cop: Decimal; tasaUsada?: string } =>
    currency === 'COP'
      ? { cop: new Decimal(valor) }
      : { cop: new Decimal(valor).times(tasaEf), tasaUsada: tasaEf.toString() };

  const snapshots: CostoUnitarioSnapshot[] = [];
  let acumCop = new Decimal(0);

  // 1) Subtotal de administradores = cantidad × costo unitario vigente.
  const adminUnit = aCop(input.costoUnitarioAdmin.currency, input.costoUnitarioAdmin.valor);
  const subtotalAdmin = adminUnit.cop.times(input.administradores);
  acumCop = acumCop.plus(subtotalAdmin);
  snapshots.push({
    concepto: 'Administradores',
    currency: input.costoUnitarioAdmin.currency,
    valorOriginal: input.costoUnitarioAdmin.valor,
    tasaUsada: adminUnit.tasaUsada,
    valorConvertidoCop: subtotalAdmin.toString(),
  });

  // 2) Demás costos (unitario × cantidad + fijo).
  for (const item of input.costItems) {
    let itemCop = new Decimal(0);
    if (item.unitCostOriginal !== undefined) {
      const c = aCop(item.currency, item.unitCostOriginal);
      itemCop = itemCop.plus(c.cop.times(item.cantidad ?? 1));
    }
    if (item.fixedCostOriginal !== undefined) {
      const c = aCop(item.currency, item.fixedCostOriginal);
      itemCop = itemCop.plus(c.cop);
    }
    acumCop = acumCop.plus(itemCop);
    snapshots.push({
      concepto: item.concepto,
      currency: item.currency,
      valorOriginal: item.unitCostOriginal ?? item.fixedCostOriginal ?? '0',
      tasaUsada: item.currency === 'USD' ? tasaEf.toString() : undefined,
      valorConvertidoCop: itemCop.toString(),
    });
  }

  // 3) Redondeo comercial SOLO en el total (los sub-centavo ya sumaron con precisión completa).
  const costoOperativoCop = redondearComercial(acumCop, 2);
  const precioSugeridoCop = redondearComercial(
    costoOperativoCop.times(new Decimal(1).plus(new Decimal(input.utilidadPct).div(100))),
    2,
  );
  // Precio USD con TRM OFICIAL (no efectiva).
  const precioSugeridoUsd = redondearComercial(precioSugeridoCop.div(trm), 2);

  return {
    trmOficial: trm.toString(),
    proteccionCambiariaPct: input.proteccionCambiariaPct,
    tasaEfectiva: tasaEf.toString(),
    subtotalAdministradoresCop: subtotalAdmin.toString(),
    costosUnitarios: snapshots,
    costoOperativoCop: costoOperativoCop.toString(),
    utilidadPct: input.utilidadPct,
    precioSugeridoCop: precioSugeridoCop.toString(),
    precioSugeridoUsd: precioSugeridoUsd.toString(),
  };
}
