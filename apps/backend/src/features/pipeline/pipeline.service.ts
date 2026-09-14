import type { FilterQuery, Types } from 'mongoose';
import { countScoped, findScoped } from '../../repositories/base.repository.js';
import { listEstados } from '../estado/estado.service.js';
import { Lead } from '../lead/lead.model.js';
import { buildLeadFilter, hidratarLeadsParaListado } from '../lead/lead.service.js';
import { existeSemaforo } from '../semaforo/semaforo.service.js';
import type { ILeadDocument, ILeadLean, ILeadListItemResponse } from '../lead/lead.types.js';
import type {
  IPipelineColumnResponse,
  IPipelineResponse,
  PipelineQuery,
} from './pipeline.types.js';

/** Igual que en el resto de services: `base.repository` la declara pero no la exporta. */
type TenantId = string | Types.ObjectId;

/**
 * El embudo del tenant: una columna por etapa activa, en orden de pipeline (HU-PIPE-01).
 *
 * Tres decisiones que conviene no deshacer al tocar esto:
 *
 * - **Sin `aggregate`.** Un `$group` por etapa parece la solución obvia, pero `base.repository` no
 *   expone `aggregateScoped`, así que habría que escribir el `$match: { tenantId }` a mano — justo
 *   la clase de query que las reglas del proyecto sacan del alcance del programador. N pares de
 *   `findScoped` + `countScoped` sobre el índice `{ tenantId, estado, createdAt: -1 }`, que ya
 *   existe, son baratos e **imposibles de escribir mal**.
 *
 * - **La hidratación es UNA sola para todo el tablero**, no una por columna: se juntan los leads de
 *   todas las etapas y se resuelven contacto, responsable y etiquetas de golpe. Hacerlo por columna
 *   serían diez veces las mismas consultas para pintar los mismos nombres.
 *
 * - **Se reutiliza la proyección de la tabla** (`hidratarLeadsParaListado`). Una tarjeta construida
 *   aparte divergiría de la fila en la primera modificación del listado.
 */
export async function getPipeline(
  tenantId: TenantId,
  query: PipelineQuery,
  puedeVerSensibles = false,
): Promise<IPipelineResponse> {
  const { limit } = query;

  // Solo las activas: una etapa archivada no se ofrece para mover, así que una columna suya sería
  // una invitación a soltar ahí una tarjeta que el service va a rechazar.
  const etapas = (await listEstados(tenantId)).filter((e) => e.activo);
  if (etapas.length === 0) return { columnas: [], limit };

  // Mismos filtros que la tabla, construidos por la misma función. `page` no se usa dentro de
  // `buildLeadFilter`; va como 1 para satisfacer la forma de `ListLeadsQuery`.
  const filtroComun = buildLeadFilter({
    page: 1,
    limit,
    asesor: query.asesor,
    semaforo: query.semaforo,
    desde: query.desde,
    hasta: query.hasta,
  });

  // Desde HU-CRM-04 el semáforo es un campo del lead, así que `buildLeadFilter` ya lo dejó puesto
  // en `filtroComun`; aquí solo queda descartar una clave que no exista en el catálogo de ESTE
  // tenant. En ese caso el tablero sale con todas sus columnas **vacías pero presentes**: el
  // usuario pidió acotar y debe ver que no hay nada, no el embudo sin filtrar ni una pantalla en
  // blanco que no explica por qué.
  if (query.semaforo && !(await existeSemaforo(tenantId, query.semaforo))) {
    return {
      columnas: etapas.map((etapa) => ({ etapa, total: 0, leads: [] })),
      limit,
    };
  }

  const columnas = await Promise.all(
    etapas.map(async (etapa) => {
      const filtro: FilterQuery<ILeadDocument> = { ...filtroComun, estado: etapa.key };
      const [leads, total] = await Promise.all([
        findScoped(Lead, tenantId, filtro)
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean<ILeadLean[]>(),
        countScoped(Lead, tenantId, filtro),
      ]);
      return { etapa, total, leads };
    }),
  );

  const hidratados = await hidratarLeadsParaListado(
    tenantId,
    columnas.flatMap((c) => c.leads),
    puedeVerSensibles,
  );
  const porId = new Map(hidratados.map((lead) => [lead.id, lead]));

  return {
    columnas: columnas.map(
      (columna): IPipelineColumnResponse => ({
        etapa: columna.etapa,
        total: columna.total,
        // Se remapea desde los leads crudos para conservar el orden de cada columna, que el
        // aplanado y la hidratación no garantizan.
        leads: columna.leads
          .map((lead) => porId.get(String(lead._id)))
          .filter((lead): lead is ILeadListItemResponse => lead !== undefined),
      }),
    ),
    limit,
  };
}
