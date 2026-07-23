import { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { ExchangeRate } from './exchange-rate.model.js';
import type { ITrmProvider } from '../../integrations/trm/trm-provider.interface.js';
import type {
  EstadoTasa,
  IExchangeRateDocument,
  IExchangeRateResponse,
  IExchangeRateVigente,
  RegisterManualRateDTO,
} from './exchange-rate.types.js';

// `ExchangeRate` es catálogo GLOBAL: NO usa el repositorio *Scoped (no tiene `tenantId`).

// Colombia es UTC-5 sin horario de verano: el "día vigente" se calcula desplazando 5h.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
function bogotaDay(date: Date): string {
  const shifted = new Date(date.getTime() - BOGOTA_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function esTasaValida(tasa: string, fecha: Date): boolean {
  const n = Number(tasa);
  return Number.isFinite(n) && n > 0 && fecha instanceof Date && !Number.isNaN(fecha.getTime());
}

function assertTasaValida(tasa: string): void {
  const n = Number(tasa);
  if (!Number.isFinite(n) || n <= 0) {
    throw new AppError('La tasa debe ser un número positivo finito.', 422);
  }
}

function mapToResponse(doc: IExchangeRateDocument): IExchangeRateResponse {
  return {
    _id: doc._id.toString(),
    monedaBase: doc.monedaBase,
    monedaCotizada: doc.monedaCotizada,
    tasaCopPorUsd: doc.tasaCopPorUsd.toString(),
    fuente: doc.fuente,
    tipoFuente: doc.tipoFuente,
    fechaVigencia: doc.fechaVigencia.toISOString(),
    consultadaEn: doc.consultadaEn.toISOString(),
    creadaPor: doc.creadaPor,
    esOficial: doc.esOficial,
    esOverrideManual: doc.esOverrideManual,
    motivoOverride: doc.motivoOverride,
    overrideExpiraEn: doc.overrideExpiraEn ? doc.overrideExpiraEn.toISOString() : undefined,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt.toISOString(),
  };
}

/**
 * Tasa aplicable ahora, con su estado calculado:
 *  1) override MANUAL activo y no expirado → MANUAL
 *  2) última OFICIAL → CURRENT (vigencia = hoy) o STALE (vigencia anterior)
 *  3) ninguna → UNAVAILABLE (nunca 0)
 */
export async function getVigente(now: Date = new Date()): Promise<IExchangeRateVigente> {
  const manual = await ExchangeRate.findOne({
    esOverrideManual: true,
    activoOverride: true,
    $or: [{ overrideExpiraEn: null }, { overrideExpiraEn: { $gt: now } }],
  })
    .sort({ consultadaEn: -1 })
    .lean<IExchangeRateDocument>();
  if (manual) return { estado: 'MANUAL', tasa: mapToResponse(manual) };

  const oficial = await ExchangeRate.findOne({ esOficial: true })
    .sort({ fechaVigencia: -1, consultadaEn: -1 })
    .lean<IExchangeRateDocument>();
  if (oficial) {
    const estado: EstadoTasa =
      bogotaDay(oficial.fechaVigencia) === bogotaDay(now) ? 'CURRENT' : 'STALE';
    return { estado, tasa: mapToResponse(oficial) };
  }

  return { estado: 'UNAVAILABLE', tasa: null };
}

/**
 * Consulta la fuente oficial (vía el provider inyectado) y persiste la tasa. Si la fuente no
 * responde o devuelve una respuesta inválida, NO reemplaza: conserva la última vigente (CA-20).
 */
export async function registerOficial(
  provider: ITrmProvider,
  now: Date = new Date(),
): Promise<IExchangeRateVigente> {
  let fetched;
  try {
    fetched = await provider.fetchTrmVigente();
  } catch {
    // Timeout / fuente caída: no romper, conservar la última vigente.
    return getVigente(now);
  }

  if (!esTasaValida(fetched.tasaCopPorUsd, fetched.fechaVigencia)) {
    // Respuesta inválida: no persistir basura, conservar la última vigente.
    return getVigente(now);
  }

  // Dedupe por día: si ya existe una oficial con la misma fecha de vigencia, no la dupliques.
  const ultimaOficial = await ExchangeRate.findOne({ esOficial: true })
    .sort({ fechaVigencia: -1 })
    .lean<IExchangeRateDocument>();
  if (ultimaOficial && bogotaDay(ultimaOficial.fechaVigencia) === bogotaDay(fetched.fechaVigencia)) {
    return getVigente(now);
  }

  await ExchangeRate.create({
    monedaBase: 'USD',
    monedaCotizada: 'COP',
    tasaCopPorUsd: Types.Decimal128.fromString(fetched.tasaCopPorUsd),
    fuente: fetched.fuente,
    tipoFuente: provider.tipoFuente,
    fechaVigencia: fetched.fechaVigencia,
    consultadaEn: now,
    esOficial: true,
    esOverrideManual: false,
    activoOverride: false,
  });

  return getVigente(now);
}

/**
 * Registra una tasa MANUAL temporal (respaldo cuando la fuente oficial no responde). Registra
 * motivo y usuario responsable. NO borra ni sobrescribe el historial de tasas oficiales (CA-21).
 */
export async function registerManual(
  dto: RegisterManualRateDTO,
  usuarioId: string,
  now: Date = new Date(),
): Promise<IExchangeRateVigente> {
  assertTasaValida(dto.valorCopPorUsd);

  // Solo un override manual activo a la vez (los previos quedan en el historial, inactivos).
  await ExchangeRate.updateMany(
    { esOverrideManual: true, activoOverride: true },
    { $set: { activoOverride: false } },
  );

  await ExchangeRate.create({
    monedaBase: 'USD',
    monedaCotizada: 'COP',
    tasaCopPorUsd: Types.Decimal128.fromString(dto.valorCopPorUsd),
    fuente: 'Tasa manual (superadmin)',
    tipoFuente: 'MANUAL',
    fechaVigencia: dto.fechaVigencia,
    consultadaEn: now,
    creadaPor: usuarioId,
    esOficial: false,
    esOverrideManual: true,
    activoOverride: true,
    motivoOverride: dto.motivo,
    overrideExpiraEn: dto.expiraEn,
  });

  return getVigente(now);
}

/**
 * Tasa vigente, refrescándola desde la fuente oficial si NO hay una tasa de hoy (best-effort).
 * Si ya es CURRENT o hay un override MANUAL activo, no consulta la fuente (evita llamadas de más).
 */
export async function getVigenteFresco(
  provider: ITrmProvider,
  now: Date = new Date(),
): Promise<IExchangeRateVigente> {
  const actual = await getVigente(now);
  if (actual.estado === 'CURRENT' || actual.estado === 'MANUAL') return actual;
  // STALE o UNAVAILABLE → intenta traer la TRM de hoy (registerOficial no rompe si la fuente falla).
  return registerOficial(provider, now);
}

/** Desactiva el override manual activo (sin borrarlo) y vuelve a la última tasa oficial. */
export async function revertToOficial(now: Date = new Date()): Promise<IExchangeRateVigente> {
  await ExchangeRate.updateMany(
    { esOverrideManual: true, activoOverride: true },
    { $set: { activoOverride: false } },
  );
  return getVigente(now);
}

/** Historial de auditoría (oficiales + manuales), más recientes primero. */
export async function listHistorial(limit = 50): Promise<IExchangeRateResponse[]> {
  const docs = await ExchangeRate.find()
    .sort({ consultadaEn: -1 })
    .limit(limit)
    .lean<IExchangeRateDocument[]>();
  return docs.map(mapToResponse);
}
