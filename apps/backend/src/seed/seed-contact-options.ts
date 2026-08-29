import { Types } from 'mongoose';
import { logger } from '../utils/logger.js';
import { ContactOption } from '../features/contact-option/contact-option.model.js';
import { Tenant } from '../features/tenant/tenant.model.js';
import type { TipoOpcionContacto } from '../features/contact-option/contact-option.types.js';

/**
 * Catálogos de fábrica de la ficha del contacto (HU-CRM-02).
 *
 * Las `key` son **exactamente** los valores que antes eran el `enum` del schema de `Cliente`. No es
 * cosmético: los contactos que ya tienen `nivelInteres: 'tibio'` guardado siguen resolviendo su
 * etiqueta contra esta semilla, así que el paso de enum a catálogo no necesita migrar un solo
 * documento.
 *
 * Son un punto de partida, no estructura: el administrador las renombra, las reordena, las archiva
 * y añade las suyas.
 */
export const OPCIONES_DEFECTO: {
  tipo: TipoOpcionContacto;
  key: string;
  label: string;
  color: string;
}[] = [
  // El interés es una escala térmica y el color la hace legible de un vistazo: azul frío, ámbar
  // tibio, rojo caliente. Los hex son los mismos que ofrece el selector de color de las etiquetas,
  // para que el CRM entero hable de "rojo" con un único rojo.
  { tipo: 'interes', key: 'frio', label: 'Frío', color: '#2563EB' },
  { tipo: 'interes', key: 'tibio', label: 'Tibio', color: '#CA8A04' },
  { tipo: 'interes', key: 'caliente', label: 'Caliente', color: '#DC2626' },
  { tipo: 'objecion', key: 'precio', label: 'Precio', color: '#EA580C' },
  { tipo: 'objecion', key: 'tiempo', label: 'Tiempo', color: '#CA8A04' },
  { tipo: 'objecion', key: 'confianza', label: 'Confianza', color: '#7C3AED' },
  { tipo: 'objecion', key: 'otra', label: 'Otra', color: '#475569' },
  { tipo: 'rol', key: 'decisor', label: 'Decisor', color: '#16A34A' },
  { tipo: 'rol', key: 'usuario', label: 'Usuario', color: '#0891B2' },
  { tipo: 'rol', key: 'desconocido', label: 'Desconocido', color: '#475569' },
];

/**
 * Siembra los tres catálogos de UN tenant, **una sola vez en su vida**.
 *
 * La marca `Tenant.opcionesContactoSeeded` cumple aquí el mismo papel que `semaforoTagsSeeded` en
 * las etiquetas de semáforo: es lo único que distingue "este tenant nunca las tuvo" de "el
 * administrador las borró a propósito". Sin ella, cada arranque resucitaría con su nombre de fábrica
 * una opción que alguien eliminó. `$setOnInsert` protege además el renombrado dentro de la única
 * siembra.
 *
 * Las escrituras van con `tenantId` explícito en el filtro y no por el repositorio scoped porque
 * esto es una semilla de arranque sin `req.user` del que sacarlo — la misma excepción, y con la
 * misma forma, que `seed-semaforo-tags.ts`.
 */
export async function seedContactOptions(tenantId: string | Types.ObjectId): Promise<void> {
  const oid = typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId;

  const tenant = await Tenant.findById(oid, { opcionesContactoSeeded: 1 }).lean();
  if (tenant?.opcionesContactoSeeded === true) return;

  // El índice del array fija el orden inicial de cada desplegable: 'Frío', 'Tibio', 'Caliente' se
  // leen como una escala, y ordenarlas alfabéticamente ('Caliente' primero) la destruiría.
  const ordenPorTipo: Partial<Record<TipoOpcionContacto, number>> = {};

  for (const opcion of OPCIONES_DEFECTO) {
    const orden = ordenPorTipo[opcion.tipo] ?? 0;
    ordenPorTipo[opcion.tipo] = orden + 1;

    await ContactOption.updateOne(
      { tenantId: oid, tipo: opcion.tipo, key: opcion.key },
      { $setOnInsert: { tenantId: oid, ...opcion, orden, activo: true, esDefecto: true } },
      { upsert: true },
    );
  }

  // Se marca al final: si la siembra falla a medias, el siguiente arranque la reintenta.
  await Tenant.updateOne({ _id: oid }, { $set: { opcionesContactoSeeded: true } });
}

/**
 * Pinta las opciones de fábrica que se sembraron **antes** de que el color existiera.
 *
 * Va apuntado por `key` y con `color: { $exists: false }`: solo toca lo que nunca tuvo color, así
 * que un administrador que ya eligió el suyo no lo pierde en el siguiente despliegue. Las opciones
 * creadas a mano sin color se quedan con el gris del `default` del schema — no hay forma de adivinar
 * qué color querría para "Muy interesado".
 */
async function backfillColores(): Promise<void> {
  let pintadas = 0;
  for (const opcion of OPCIONES_DEFECTO) {
    const res = await ContactOption.updateMany(
      { tipo: opcion.tipo, key: opcion.key, esDefecto: true, color: { $exists: false } },
      { $set: { color: opcion.color } },
    );
    pintadas += res.modifiedCount;
  }
  if (pintadas > 0) logger.info('Colores de opciones de contacto rellenados.', { pintadas });
}

/**
 * Backfill para los tenants que ya existían antes de que estos catálogos fueran datos. Los ya
 * sembrados quedan fuera de la consulta, así que el coste tiende a cero y los borrados del
 * administrador sobreviven a los despliegues.
 */
export async function backfillContactOptions(): Promise<void> {
  const tenants = await Tenant.find({ opcionesContactoSeeded: { $ne: true } }, { _id: 1 }).lean();
  for (const tenant of tenants) {
    await seedContactOptions(tenant._id as Types.ObjectId);
  }
  logger.info('Seed de opciones de contacto verificado.', { sembrados: tenants.length });

  // Aparte de la siembra: los tenants YA sembrados también necesitan el color, y esos no entran
  // en la consulta de arriba precisamente por estar marcados.
  await backfillColores();
}
