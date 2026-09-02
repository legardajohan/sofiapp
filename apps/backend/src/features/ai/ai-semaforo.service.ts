import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import {
  findByIdScoped,
  findOneAndUpdateScoped,
  updateManyScoped,
} from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { ISemaforoIA } from '../cliente/cliente.types.js';
import { findSemaforoTags } from '../tag/tag.service.js';
import type { ITagResponse, SemaforoSlug } from '../tag/tag.types.js';
import { listAuditEvents, recordAuditEvent } from '../audit/audit.service.js';
import { findUsersByIds } from '../users/user.service.js';
import { getAIService } from '../../services/ai/ai-service.singleton.js';
import type { ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import { publishConversationUpdated } from '../conversation/conversation.service.js';
import { turnosDelCliente } from './ai-shared.js';
import { semaforoDeClasificacion, semaforoVigente } from './ai-semaforo.types.js';
import type { IClasificacionResponse } from './ai-semaforo.types.js';

/**
 * Mueve el semáforo sin tocar las demás etiquetas.
 *
 * Dos updates y no uno porque Mongo no admite `$pull` y `$addToSet` sobre el mismo campo en la
 * misma operación. La alternativa —recalcular el array en JS y escribirlo entero— sí sería un solo
 * update, pero perdería una edición manual concurrente: entre la lectura y la escritura del worker
 * cabe que un asesor aplique una etiqueta desde la bandeja, y el array recalculado la borraría.
 * Los operadores atómicos no.
 *
 * **NUNCA `setConversationTags`**: reemplaza el conjunto completo (conversation.service.ts) y se
 * llevaría por delante las etiquetas libres de la empresa.
 */
async function moverSemaforo(
  tenantId: string,
  clienteId: string,
  idsSemaforo: Types.ObjectId[],
  idDestino: Types.ObjectId,
  semaforoIA: ISemaforoIA,
): Promise<void> {
  const _id = new Types.ObjectId(clienteId);
  await updateManyScoped(Cliente, tenantId, { _id }, { $pull: { tagIds: { $in: idsSemaforo } } });
  await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id },
    { $addToSet: { tagIds: idDestino }, $set: { semaforoIA } },
  );
}

/**
 * Clasifica la conversación y aplica —o propone— el semáforo resultante (HU-IA-05).
 *
 * **Nunca lanza.** Se invoca al final del ciclo de auto-reply, cuando la respuesta al cliente ya
 * salió; propagar un fallo del clasificador marcaría como fallido un job que hizo su trabajo.
 * Mismo criterio que `disparaIntencionDeCompra` en `ai-handoff.service`.
 *
 * Escribe el semáforo solo si se cumplen las SEIS condiciones (ver el `plan.md` de la historia):
 * interruptor activo · la etiqueta del slug destino existe · confianza sobre el umbral · turnos
 * suficientes del cliente · el destino no es el vigente · nadie lo cambió a mano. En cualquier otro
 * caso guarda la propuesta y la bandeja ofrece aplicarla.
 */
export async function clasificarYAplicarSemaforo(
  tenantId: string,
  clienteId: string,
  historial: ChatTurn[],
): Promise<void> {
  // Antes de cualquier llamada: el interruptor tiene que ahorrar también el coste del modelo.
  if (env.SEMAFORO_AUTO !== 'on') return;
  // Igual con los turnos: una conversación de un solo "hola" clasificaría como fría y pintaría de
  // azul toda la bandeja. No hay nada que ganar pagando esa llamada.
  if (turnosDelCliente(historial) < env.SEMAFORO_MIN_TURNOS_CLIENTE) return;

  try {
    const { data } = await getAIService().classify({
      tenantId: new Types.ObjectId(tenantId),
      historial,
    });

    const slug = semaforoDeClasificacion(data.nivelInteres, data.objecion);
    const [cliente, tagsPorSlug] = await Promise.all([
      findByIdScoped(Cliente, tenantId, clienteId).lean(),
      findSemaforoTags(tenantId),
    ]);
    if (!cliente) return;

    const vigente = semaforoVigente(cliente.tagIds ?? [], tagsPorSlug);
    const tagDestino = tagsPorSlug.get(slug);
    const anterior = cliente.semaforoIA ?? null;

    // Intervención humana: el semáforo puesto no es el que la IA aplicó. Desde ese momento la IA
    // solo propone — corregirla a mano y que lo revierta al minuto siguiente sería pelearse con
    // el asesor.
    const hayOverrideHumano = vigente !== null && vigente !== (anterior?.aplicado ?? null);

    const aplica =
      tagDestino !== undefined &&
      data.confianza >= env.SEMAFORO_MIN_CONFIANZA &&
      slug !== vigente &&
      !hayOverrideHumano;

    const semaforoIA: ISemaforoIA = {
      slug,
      confianza: data.confianza,
      motivo: data.motivo,
      nivelInteres: data.nivelInteres,
      objecion: data.objecion,
      at: new Date(),
      // Al aplicar, el slug queda registrado como "puesto por la IA"; si no, se conserva lo que la
      // IA hubiera aplicado antes, para no perder el rastro que detecta el override humano.
      aplicado: aplica ? slug : (anterior?.aplicado ?? null),
    };

    if (aplica) {
      const idsSemaforo = [...tagsPorSlug.values()].map((t) => new Types.ObjectId(t.id));
      await moverSemaforo(
        tenantId,
        clienteId,
        idsSemaforo,
        new Types.ObjectId(tagDestino.id),
        semaforoIA,
      );
    } else {
      await findOneAndUpdateScoped(
        Cliente,
        tenantId,
        { _id: new Types.ObjectId(clienteId) },
        { $set: { semaforoIA } },
      );
    }

    // Solo cuando el slug sugerido difiere del vigente. Auditar cada mensaje dejaría un evento
    // idéntico por cada respuesta de Sofi e inundaría `audit_events`, volviendo inútil la bitácora.
    if (slug !== vigente) {
      await recordAuditEvent(tenantId, {
        actorId: null, // el sistema
        accion: 'cliente.semaforo',
        entidad: 'cliente',
        entidadId: clienteId,
        antes: { semaforo: vigente },
        despues: {
          semaforo: slug,
          aplicado: aplica,
          confianza: data.confianza,
          motivo: data.motivo,
          nivelInteres: data.nivelInteres,
          objecion: data.objecion,
        },
      });
    }

    if (aplica) await publishConversationUpdated(tenantId, clienteId);
  } catch (err: unknown) {
    // No se propaga: la respuesta al cliente ya salió. Perder una clasificación cuesta un semáforo
    // desactualizado; propagar costaría marcar el job como fallido y reintentar toda la generación.
    logger.warn('Semáforo: falló la clasificación de intención', {
      tenantId,
      clienteId,
      error: String(err),
    });
  }
}

/**
 * Aplica la sugerencia pendiente que dejó la IA (HU-IA-05).
 *
 * No acepta un slug del llamador a propósito: el destino es el que la IA ya guardó. Aceptarlo
 * convertiría este endpoint en un segundo camino para etiquetar a mano, que ya existe
 * (`PATCH /:id/tags`) y con otra semántica.
 */
export async function aplicarSemaforoSugerido(
  tenantId: string,
  clienteId: string,
  actorId: string,
): Promise<void> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente) throw new AppError('Conversación no encontrada.', 404);

  const sugerencia = cliente.semaforoIA;
  if (!sugerencia) {
    throw new AppError('Esta conversación no tiene una clasificación de la IA todavía.', 409);
  }

  const tagsPorSlug = await findSemaforoTags(tenantId);
  const tagDestino = tagsPorSlug.get(sugerencia.slug);
  if (!tagDestino) {
    throw new AppError(
      'La etiqueta de semáforo que sugiere la IA ya no existe. Vuelve a crearla desde Etiquetas.',
      409,
    );
  }

  const vigente = semaforoVigente(cliente.tagIds ?? [], tagsPorSlug);
  if (vigente === sugerencia.slug) {
    throw new AppError('Esa clasificación ya está aplicada.', 409);
  }

  const idsSemaforo = [...tagsPorSlug.values()].map((t) => new Types.ObjectId(t.id));
  await moverSemaforo(tenantId, clienteId, idsSemaforo, new Types.ObjectId(tagDestino.id), {
    ...sugerencia,
    aplicado: sugerencia.slug,
  });

  await recordAuditEvent(tenantId, {
    // Aquí SÍ hay una persona detrás: quien pulsó el botón, no el sistema.
    actorId,
    accion: 'cliente.semaforo',
    entidad: 'cliente',
    entidadId: clienteId,
    antes: { semaforo: vigente },
    despues: {
      semaforo: sugerencia.slug,
      aplicado: true,
      confianza: sugerencia.confianza,
      motivo: sugerencia.motivo,
      nivelInteres: sugerencia.nivelInteres,
      objecion: sugerencia.objecion,
    },
  });

  await publishConversationUpdated(tenantId, clienteId);
}

/**
 * Bitácora de clasificaciones de una conversación. Molde de `listAssignments`, con el filtro por
 * acción para que no se mezclen las reasignaciones (comparten `entidad: 'cliente'`).
 */
export async function listClasificaciones(
  tenantId: string,
  clienteId: string,
  page: number,
  limit: number,
): Promise<{ data: IClasificacionResponse[]; page: number; limit: number; total: number }> {
  // La guarda de 404 va ANTES de leer la bitácora: es lo que impide que un token de otro tenant
  // descubra siquiera si esa conversación existe.
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente) throw new AppError('Conversación no encontrada.', 404);

  const { data, total } = await listAuditEvents(
    tenantId,
    'cliente',
    clienteId,
    page,
    limit,
    'cliente.semaforo',
  );

  const actorIds = data.map((e) => e.actorId).filter((id): id is string => id !== null);
  const userMap = await findUsersByIds(tenantId, actorIds);

  return {
    data: data.map((evt) => ({
      id: evt.id,
      actorId: evt.actorId,
      actorNombre: evt.actorId ? (userMap.get(evt.actorId)?.nombre ?? null) : null,
      de: (evt.antes['semaforo'] as SemaforoSlug | null) ?? null,
      a: (evt.despues['semaforo'] as SemaforoSlug | null) ?? null,
      aplicado: evt.despues['aplicado'] === true,
      confianza: typeof evt.despues['confianza'] === 'number' ? evt.despues['confianza'] : null,
      motivo: typeof evt.despues['motivo'] === 'string' ? evt.despues['motivo'] : null,
      createdAt: evt.createdAt,
    })),
    page,
    limit,
    total,
  };
}
