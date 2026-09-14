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
export const ESTADOS_DEFECTO: {
  key: string;
  label: string;
  color: string;
  esSalida: boolean;
}[] = [
  { key: 'nuevo', label: 'Nuevo', color: '#64748B', esSalida: false },
  { key: 'en_gestion', label: 'En gestión', color: '#2563EB', esSalida: false },
  { key: 'pago_pendiente', label: 'Pago pendiente', color: '#D97706', esSalida: false },
  { key: 'pagado', label: 'Pagado', color: '#16A34A', esSalida: false },
  { key: 'perdido', label: 'Perdido', color: '#DC2626', esSalida: true },
  // HU-PIPE-01. Convive con `perdido` a propósito: `perdido` es la oportunidad que se enfrió y
  // `declinado` la que dijo que no. Distinguirlas es lo que hace accionable el embudo — una se
  // reintenta en la siguiente campaña, la otra no.
  { key: 'declinado', label: 'Declinado', color: '#B91C1C', esSalida: true },
];

/** Las etapas de salida de fábrica. Fuente única para la siembra y para el backfill. */
const KEYS_DE_SALIDA = ESTADOS_DEFECTO.filter((e) => e.esSalida).map((e) => e.key);

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

/**
 * Añade la etapa `declinado` y marca las etapas de salida en los tenants **ya sembrados**
 * (HU-PIPE-01).
 *
 * `seedEstados` no sirve para esto: sale antes de tiempo con `estadosSeeded: true`, que es
 * exactamente lo que tienen todos los tenants existentes. De ahí un backfill dirigido y propio,
 * que recorre **todos** los tenants en vez de solo los no sembrados.
 *
 * Es idempotente y **no pisa** decisiones del administrador:
 * - `declinado` se inserta con `$setOnInsert`, así que un "Declinado" ya renombrado o recoloreado
 *   se queda como está.
 * - `esSalida` solo se escribe donde el campo **no existe** (documentos anteriores al feature).
 *   Nunca contra un `false` explícito, que solo puede venir de una elección posterior.
 * - El `orden` va al final del pipeline **de cada tenant**, no en una posición fija: cada empresa
 *   tiene el suyo y puede haber añadido etapas propias.
 */
export async function backfillEstadoDeclinado(): Promise<void> {
  const tenants = await Tenant.find({}, { _id: 1 }).lean();
  if (tenants.length === 0) return;

  const declinado = ESTADOS_DEFECTO.find((e) => e.key === 'declinado')!;
  let insertados = 0;
  let marcados = 0;

  for (const tenant of tenants) {
    const oid = tenant._id as Types.ObjectId;
    try {
      const existentes = await Estado.find({ tenantId: oid }, { key: 1, orden: 1 }).lean();
      // Un tenant sin catálogo todavía no pasó por `seedEstados`; `backfillEstados` lo cubrirá
      // con la semilla completa, que ya incluye `declinado`. Tocarlo aquí lo dejaría con una
      // sola etapa y sin las cuatro anteriores.
      if (existentes.length === 0) continue;

      if (!existentes.some((e) => e.key === declinado.key)) {
        const orden = existentes.reduce((max, e) => Math.max(max, e.orden), -1) + 1;
        await Estado.updateOne(
          { tenantId: oid, key: declinado.key },
          { $setOnInsert: { tenantId: oid, ...declinado, orden, activo: true, esDefecto: true } },
          { upsert: true },
        );
        insertados += 1;
      }

      const res = await Estado.updateMany(
        { tenantId: oid, key: { $in: KEYS_DE_SALIDA }, esSalida: { $exists: false } },
        { $set: { esSalida: true } },
      );
      marcados += res.modifiedCount;
    } catch (err) {
      logger.error('backfillEstadoDeclinado falló para un tenant', {
        tenantId: String(oid),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (insertados > 0 || marcados > 0) {
    logger.info(
      `backfillEstadoDeclinado: ${insertados} etapas "Declinado" creadas, ${marcados} etapas marcadas como salida.`,
    );
  }
}
