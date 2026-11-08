import type { Types } from 'mongoose';
import { findOneAndUpdateScoped, findOneScoped } from '../../repositories/base.repository.js';
import {
  SEND_WINDOW_INVALIDATE_CHANNEL,
  publicarInterno,
  suscribirInterno,
} from '../../realtime/internal-bus.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { festivosColombia } from './send-window.holidays.js';
import { SendWindowConfig } from './send-window.model.js';
import { evaluarVentana, ultimoMomentoAbierto } from './send-window.policy.js';
import {
  CATEGORIAS_ENVIO,
  CONFIG_DEFECTO,
  type CategoriaEnvio,
  type IEstadoCategoriaResponse,
  type IFestivoResponse,
  type IPoliticaVentana,
  type IRetencionInput,
  type ISendWindowConfig,
  type ISendWindowResponse,
  type ISendWindowStatusResponse,
  type ResultadoVentana,
  type UpdateSendWindowDTO,
} from './send-window.types.js';

type TenantId = string | Types.ObjectId;

/** Status del bloqueo de un envío fuera de franja. 423 Locked: el recurso existe, pero ahora no. */
export const STATUS_VENTANA_CERRADA = 423;

// ── Caché por proceso ───────────────────────────────────────────────────────
//
// `sendOutbound` consulta la política en CADA envío: sin caché sería una lectura de Mongo extra en
// el camino caliente. La clave es el `tenantId` (nunca se comparte entre tenants). Un PUT borra la
// entrada local y avisa por Redis a los demás procesos; si el aviso no llega, el TTL acota el
// desfase a 60 s.

const TTL_CACHE_MS = 60_000;
const cache = new Map<string, { politica: IPoliticaVentana; expira: number }>();

export function invalidarCacheVentana(tenantId: string): void {
  cache.delete(tenantId);
}

/** Para los tests: vacía la caché entera. */
export function limpiarCacheVentana(): void {
  cache.clear();
}

/** Suscribe este proceso a las invalidaciones publicadas por los demás (web y worker). */
export function suscribirInvalidacionVentana(): void {
  suscribirInterno(SEND_WINDOW_INVALIDATE_CHANNEL, ({ tenantId }) => invalidarCacheVentana(tenantId));
}

type ConfigLean = ISendWindowConfig & { _id: Types.ObjectId; updatedAt?: Date };

function aPolitica(doc: ConfigLean | null): IPoliticaVentana {
  if (!doc) return CONFIG_DEFECTO;
  return {
    activo: doc.activo,
    zonaHoraria: doc.zonaHoraria,
    reglas: doc.reglas,
    excepciones: doc.excepciones,
  };
}

async function leerConfig(tenantId: TenantId): Promise<ConfigLean | null> {
  return findOneScoped(SendWindowConfig, tenantId, {}).lean<ConfigLean>();
}

async function cargarPolitica(tenantId: TenantId): Promise<IPoliticaVentana> {
  const clave = tenantId.toString();
  const enCache = cache.get(clave);
  if (enCache && enCache.expira > Date.now()) return enCache.politica;
  const politica = aPolitica(await leerConfig(tenantId));
  cache.set(clave, { politica, expira: Date.now() + TTL_CACHE_MS });
  return politica;
}

// ── Configuración (CRUD) ────────────────────────────────────────────────────

function toResponse(doc: ConfigLean | null): ISendWindowResponse {
  const politica = aPolitica(doc);
  return {
    ...politica,
    // Copia profunda de los defaults: nadie aguas arriba debe poder mutar `CONFIG_DEFECTO`.
    reglas: politica.reglas.map((r) => ({
      categoria: r.categoria,
      modo: r.modo,
      franjas: r.franjas.map((f) => ({ dias: [...f.dias], desde: f.desde, hasta: f.hasta })),
    })),
    excepciones: politica.excepciones.map((e) => ({
      fecha: e.fecha,
      tipo: e.tipo,
      ...(e.franjas ? { franjas: e.franjas.map((f) => ({ desde: f.desde, hasta: f.hasta })) } : {}),
      ...(e.categorias?.length ? { categorias: [...e.categorias] } : {}),
      ...(e.motivo ? { motivo: e.motivo } : {}),
      ...(e.origen ? { origen: e.origen } : {}),
    })),
    configurado: doc !== null,
    version: doc?.version ?? 0,
    updatedAt: doc?.updatedAt?.toISOString() ?? null,
  };
}

export async function getSendWindowConfig(tenantId: string): Promise<ISendWindowResponse> {
  return toResponse(await leerConfig(tenantId));
}

export async function updateSendWindowConfig(
  tenantId: string,
  actorId: string,
  dto: UpdateSendWindowDTO,
): Promise<ISendWindowResponse> {
  const antes = toResponse(await leerConfig(tenantId));
  const doc = await findOneAndUpdateScoped(
    SendWindowConfig,
    tenantId,
    {},
    {
      $set: {
        activo: dto.activo,
        zonaHoraria: dto.zonaHoraria,
        reglas: dto.reglas,
        excepciones: dto.excepciones,
        actualizadoPor: actorId,
      },
      $inc: { version: 1 },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean<ConfigLean>();
  if (!doc) throw new AppError('No se pudo guardar la configuración de horarios.', 500);

  invalidarCacheVentana(tenantId);
  await publicarInterno(SEND_WINDOW_INVALIDATE_CHANNEL, { tenantId });

  const despues = toResponse(doc);
  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'send-window.update',
    entidad: 'send-window',
    entidadId: doc._id.toString(),
    antes: { activo: antes.activo, zonaHoraria: antes.zonaHoraria, reglas: antes.reglas, excepciones: antes.excepciones },
    despues: { activo: despues.activo, zonaHoraria: despues.zonaHoraria, reglas: despues.reglas, excepciones: despues.excepciones },
  });
  return despues;
}

export function previewHolidays(anio: number): IFestivoResponse[] {
  return festivosColombia(anio);
}

// ── Consulta y control ──────────────────────────────────────────────────────

/** ¿Puede salir ahora un envío de esta categoría para este tenant? Lee la caché. */
export async function consultarVentana(
  tenantId: TenantId,
  categoria: CategoriaEnvio,
  ahora: Date = new Date(),
): Promise<ResultadoVentana> {
  return evaluarVentana(await cargarPolitica(tenantId), categoria, ahora);
}

/**
 * Último momento abierto para esta categoría antes de `limite` (ver `ultimoMomentoAbierto`). Lee
 * la caché del tenant: una lectura de Mongo por tenant y minuto, no una por conversación.
 */
export async function ultimoMomentoDeEnvio(
  tenantId: TenantId,
  categoria: CategoriaEnvio,
  limite: Date,
  ahora: Date = new Date(),
): Promise<Date | null> {
  return ultimoMomentoAbierto(await cargarPolitica(tenantId), categoria, ahora, limite);
}

/** ¿Este error es el 423 de la ventana de envío? */
export function esVentanaCerrada(err: unknown): err is AppError {
  return err instanceof AppError && err.statusCode === STATUS_VENTANA_CERRADA;
}

/** `siguienteApertura` que viaja en el `details` del 423 (o `null`). */
export function aperturaDeError(err: AppError): Date | null {
  const valor = err.details?.['siguienteApertura'];
  return typeof valor === 'string' ? new Date(valor) : null;
}

/**
 * Control central de `sendOutbound`. Fuera de franja lanza `AppError` 423 con
 * `{ categoria, motivo, siguienteApertura }`. Para `asesor` y `plantilla_manual` (que no tienen
 * llamador que decida otra cosa: el bloqueo ES su comportamiento) deja el log de retención aquí.
 */
export async function assertVentanaEnvio(
  tenantId: TenantId,
  categoria: CategoriaEnvio,
  contexto: { clienteId?: string } = {},
  ahora: Date = new Date(),
): Promise<void> {
  const r = await consultarVentana(tenantId, categoria, ahora);
  if (r.permitido) return;

  if (categoria === 'asesor' || categoria === 'plantilla_manual') {
    await registrarRetencion(tenantId, {
      categoria,
      accion: 'bloqueado',
      siguienteApertura: r.siguienteApertura,
      ...(contexto.clienteId ? { clienteId: contexto.clienteId } : {}),
    });
  }
  throw new AppError(
    'Fuera del horario de envío configurado para este tipo de mensaje.',
    STATUS_VENTANA_CERRADA,
    {
      categoria,
      motivo: r.motivo,
      siguienteApertura: r.siguienteApertura?.toISOString() ?? null,
    },
  );
}

const CATEGORIAS_AUDITADAS_POR_CLIENTE = new Set<CategoriaEnvio>(['flujo', 'recordatorio', 'ia']);

/**
 * Deja rastro de un envío retenido: log estructurado `send_window.retenido` siempre, y auditoría
 * para las campañas (el llamador la invoca solo en la transición a retenida) y para los mensajes
 * de `flujo`, `recordatorio` e `ia`. Nunca lanza.
 */
export async function registrarRetencion(tenantId: TenantId, input: IRetencionInput): Promise<void> {
  const siguienteApertura = input.siguienteApertura?.toISOString() ?? null;
  logger.info('send_window.retenido', {
    tenantId: tenantId.toString(),
    categoria: input.categoria,
    accion: input.accion,
    ...(input.clienteId ? { clienteId: input.clienteId } : {}),
    ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    siguienteApertura,
  });

  if (input.categoria === 'campana' && input.campaignId) {
    await recordAuditEvent(tenantId, {
      actorId: null,
      accion: 'campaign.retenida-horario',
      entidad: 'campaign',
      entidadId: input.campaignId,
      antes: {},
      despues: { retenidaHasta: siguienteApertura },
    });
    return;
  }
  if (CATEGORIAS_AUDITADAS_POR_CLIENTE.has(input.categoria) && input.clienteId) {
    await recordAuditEvent(tenantId, {
      actorId: null,
      accion: 'mensaje.retenido-horario',
      entidad: 'cliente',
      entidadId: input.clienteId,
      antes: {},
      despues: { categoria: input.categoria, accion: input.accion, siguienteApertura },
    });
  }
}

export async function getSendWindowStatus(
  tenantId: string,
  ahora: Date = new Date(),
): Promise<ISendWindowStatusResponse> {
  // Lectura fresca, no la caché: el admin acaba de guardar y quiere ver el efecto ya.
  const politica = aPolitica(await leerConfig(tenantId));
  const categorias = Object.fromEntries(
    CATEGORIAS_ENVIO.map((c): [CategoriaEnvio, IEstadoCategoriaResponse] => {
      const r = evaluarVentana(politica, c, ahora);
      return [
        c,
        r.permitido
          ? { permitido: true, siguienteApertura: null, siguienteCierre: r.siguienteCierre?.toISOString() ?? null }
          : { permitido: false, siguienteApertura: r.siguienteApertura?.toISOString() ?? null, siguienteCierre: null },
      ];
    }),
  ) as Record<CategoriaEnvio, IEstadoCategoriaResponse>;
  return { activo: politica.activo, zonaHoraria: politica.zonaHoraria, ahora: ahora.toISOString(), categorias };
}
