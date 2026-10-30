import { Types } from 'mongoose';
import {
  createScoped,
  findOneScoped,
  findOneAndUpdateScoped,
  findByIdScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { metaWhatsAppClient } from '../../integrations/meta/meta-whatsapp.client.js';
import { sandboxMessagingProvider } from '../../integrations/messaging/sandbox-messaging.provider.js';
import { getIntegrationWithToken } from '../channel/channel.service.js';
import { assertWithinQuota, incrementUsage } from '../usage/usage.service.js';
import {
  assertContenidoCompatible,
  buildTemplatePayload,
  renderizarPlantillaDePrueba,
} from '../whatsapp-template/whatsapp-template.service.js';
import { asegurarMetaMediaId, extensionImagen } from '../media/media-meta-cache.js';
import type { IArchivoImagen } from '../whatsapp-template/whatsapp-template.types.js';
import {
  aImagenAlmacenada,
  consumirSubida,
  liberarSubida,
} from '../media/media-upload.service.js';
import {
  applyDeliveryStatusToRecipient,
  getNombresCampanas,
} from '../campaign/campaign.service.js';
import { publishRealtime } from '../../realtime/realtime.publisher.js';
import { toMessageResponse, type IMessageSource } from '../conversation/conversation.mapper.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from './message.model.js';
import type {
  ContenidoOutbound,
  ContextoEnvio,
  ICreateMessageDto,
  IMessageDocument,
  ISendMessageDto,
  MessageStatus,
  Sender,
} from './message.types.js';

type TenantId = string | Types.ObjectId;

const FUERA_DE_VENTANA =
  'Fuera de la ventana de 24 h. Solo se pueden enviar plantillas HSM aprobadas.';

/** Código de Mongo para clave duplicada en un índice único. */
const DUPLICATE_KEY = 11000;

function esClaveDuplicada(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === DUPLICATE_KEY;
}

/**
 * Persiste un mensaje entrante de forma idempotente por `metaMessageId` (HU-MARK-05).
 *
 * `creado: false` significa "Meta ya nos lo había entregado": el llamador NO debe volver a
 * notificar, contar como no leído ni responder. La búsqueda previa cubre el reenvío normal; el
 * índice único `{ tenantId, metaMessageId }` cubre la carrera entre dos jobs con el mismo webhook.
 */
export async function saveMessage(
  tenantId: TenantId,
  dto: ICreateMessageDto,
): Promise<{ message: IMessageDocument; creado: boolean }> {
  const buscarExistente = async (): Promise<IMessageDocument | null> =>
    dto.metaMessageId
      ? ((await findOneScoped(Message, tenantId, {
          metaMessageId: dto.metaMessageId,
        }).lean()) as unknown as IMessageDocument | null)
      : null;

  const existente = await buscarExistente();
  if (existente) return { message: existente, creado: false };

  try {
    const message = await createScoped(Message, tenantId, dto as unknown as Record<string, unknown>);
    return { message, creado: true };
  } catch (err: unknown) {
    if (!esClaveDuplicada(err)) throw err;
    const ganador = await buscarExistente();
    if (!ganador) throw err;
    return { message: ganador, creado: false };
  }
}

/**
 * Imagen de reemplazo de un envío suelto (HT-WA-04, criterio 12): valida plantilla ↔ imagen ANTES
 * de consumir la subida —un 422 no debe gastar la imagen— y la sube a Meta. Si Meta la rechaza, la
 * subida vuelve a quedar disponible para reintentar.
 *
 * No se cachea el `media id`: un envío suelto lo usa una vez. Las campañas sí lo cachean.
 */
async function subirImagenReemplazo(
  tenantId: TenantId,
  contenido: Extract<ContenidoOutbound, { modo: 'plantilla' }>,
): Promise<{ metaMediaId: string; archivo: IArchivoImagen }> {
  const uploadId = contenido.imagenHeaderUploadId as string;
  await assertContenidoCompatible(tenantId, contenido.templateId, contenido.parametros, true);

  const subida = await consumirSubida(tenantId, uploadId, 'cabecera-reemplazo');
  const almacenada = aImagenAlmacenada(subida);
  try {
    const metaMediaId = await asegurarMetaMediaId(tenantId, almacenada, {
      nombreArchivo: `envio-${uploadId}.${extensionImagen(subida.mimeType)}`,
      mensajeError: 'No se pudo subir la imagen del mensaje a WhatsApp.',
      persistir: async () => {},
    });
    // HU-MARK-05: el hilo apunta a la misma subida (ya es de este envío), sin copiar el archivo.
    const { mediaKey, mimeType, tamanoBytes } = almacenada;
    return { metaMediaId, archivo: { mediaKey, mimeType, tamanoBytes } };
  } catch (err) {
    await liberarSubida(tenantId, uploadId);
    throw err;
  }
}

/**
 * Envío de la conversación de prueba (HU-IA-08). Persiste el `Message` igual que un envío real, pero
 * con el proveedor sandbox: sin Meta, sin cuota `mensajesMes`, sin ventana de 24 h. Una plantilla se
 * guarda con su texto renderizado, tal como la habría leído el cliente; la media no está disponible.
 */
async function enviarEnPrueba(
  tenantId: TenantId,
  clienteId: string,
  contenido: ContenidoOutbound,
  sender: Sender,
): Promise<IMessageDocument> {
  if (contenido.modo === 'media') {
    throw new AppError('Enviar archivos no está disponible en el chat de prueba.', 422);
  }

  const base = {
    clienteId: new Types.ObjectId(clienteId),
    canal: 'whatsapp' as const,
    direccion: 'outbound' as const,
    status: 'sent' as const,
  };

  if (contenido.modo === 'plantilla') {
    const { messageId } = await sandboxMessagingProvider.sendTemplate('', '', '', [], '', '');
    const render = await renderizarPlantillaDePrueba(tenantId, contenido.templateId, contenido.parametros);
    return createScoped(Message, tenantId, {
      ...base,
      sender: 'bot',
      tipo: 'plantilla',
      ...(render.texto ? { texto: render.texto } : {}),
      plantilla: {
        templateId: new Types.ObjectId(contenido.templateId),
        nombre: render.nombre,
        idioma: render.idioma,
        parametros: contenido.parametros,
      },
      metaMessageId: messageId,
    } as Record<string, unknown>);
  }

  // `auto` y `texto`: en la prueba la ventana se da siempre por abierta, así que nunca cae a plantilla.
  const { messageId } = await sandboxMessagingProvider.sendText('', contenido.texto, '', '');
  return createScoped(Message, tenantId, {
    ...base,
    sender,
    tipo: 'texto',
    texto: contenido.texto,
    metaMessageId: messageId,
  } as Record<string, unknown>);
}

/**
 * Único punto del sistema donde se decide texto libre vs plantilla HSM según la ventana de 24 h
 * del cliente (`Cliente.ventana24hExpiraEn`). La bandeja (`sendMessage`), `HU-FLOW-02`
 * (recordatorios) y la futura épica de Remarketing la consumen; ninguna reimplementa la regla.
 */
export async function sendOutbound(
  tenantId: TenantId,
  clienteId: string,
  contenido: ContenidoOutbound,
  sender: Sender = 'agent',
  contexto: ContextoEnvio = {},
): Promise<IMessageDocument> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();

  // HU-IA-08: la conversación de prueba no sale a Meta ni gasta cuota ni depende de la ventana.
  // Va ANTES de la cuota a propósito: un tenant sin mensajes de plan debe poder seguir probando.
  if (cliente?.esPrueba) return enviarEnPrueba(tenantId, clienteId, contenido, sender);

  // Cuota de mensajes (outbound): bloqueo duro antes de cualquier decisión. HU-SAAS-02.
  await assertWithinQuota(tenantId, 'mensajesMes');

  if (!cliente) throw new AppError('Cliente no encontrado.', 404);

  const now = new Date();
  const ventanaAbierta = !!cliente.ventana24hExpiraEn && cliente.ventana24hExpiraEn > now;

  // Media: cae del MISMO lado que el texto libre frente a la ventana de 24 h. Se resuelve antes
  // que el resto porque su envío no comparte cuerpo con los otros modos.
  if (contenido.modo === 'media') {
    if (!ventanaAbierta) throw new AppError(FUERA_DE_VENTANA, 422);

    const integrationMedia = await getIntegrationWithToken(tenantId);
    const { messageId } = await metaWhatsAppClient.sendMedia(
      cliente.telefono,
      contenido.tipo,
      contenido.metaMediaId,
      {
        ...(contenido.caption ? { caption: contenido.caption } : {}),
        ...(contenido.nombreArchivo ? { filename: contenido.nombreArchivo } : {}),
        ...(contenido.esNotaDeVoz ? { esNotaDeVoz: true } : {}),
      },
      integrationMedia.phoneNumberId,
      integrationMedia.accessToken,
    );

    const mensajeMedia = await createScoped(Message, tenantId, {
      clienteId: new Types.ObjectId(clienteId),
      canal: 'whatsapp',
      direccion: 'outbound',
      sender,
      tipo: contenido.tipo,
      // El archivo saliente ya está en nuestro almacenamiento antes de llegar aquí, así que nace
      // `disponible`: no hay nada que descargar después.
      ...(contenido.caption ? { texto: contenido.caption } : {}),
      media: {
        estado: 'disponible' as const,
        mimeType: contenido.mimeType,
        mediaKey: contenido.mediaKey,
        metaMediaId: contenido.metaMediaId,
        tamanoBytes: contenido.tamanoBytes,
        descargadaAt: new Date(),
        ...(contenido.nombreArchivo ? { nombreArchivo: contenido.nombreArchivo } : {}),
        ...(contenido.esNotaDeVoz ? { esNotaDeVoz: true } : {}),
        ...(contenido.duracionSegundos !== undefined
          ? { duracionSegundos: contenido.duracionSegundos }
          : {}),
      },
      metaMessageId: messageId,
      status: 'sent',
    } as Record<string, unknown>);

    await incrementUsage(tenantId, 'mensajesMes');
    return mensajeMedia;
  }

  let plantilla:
    | {
        templateId: string;
        parametros: string[];
        imagenCabecera?: { metaMediaId: string };
        archivoReemplazo?: IArchivoImagen;
      }
    | undefined;
  let texto: string | undefined;

  if (contenido.modo === 'texto') {
    if (!ventanaAbierta) throw new AppError(FUERA_DE_VENTANA, 422);
    texto = contenido.texto;
  } else if (contenido.modo === 'auto') {
    if (ventanaAbierta) {
      texto = contenido.texto;
    } else if (contenido.plantillaFallback) {
      plantilla = contenido.plantillaFallback;
    } else {
      throw new AppError(FUERA_DE_VENTANA, 422);
    }
  } else {
    // 'plantilla': permitido dentro y fuera de la ventana, Meta lo acepta en ambos casos.
    const reemplazo =
      !contenido.imagenCabecera && contenido.imagenHeaderUploadId
        ? await subirImagenReemplazo(tenantId, contenido)
        : undefined;
    const imagenCabecera =
      contenido.imagenCabecera ?? (reemplazo ? { metaMediaId: reemplazo.metaMediaId } : undefined);
    plantilla = {
      templateId: contenido.templateId,
      parametros: contenido.parametros,
      ...(imagenCabecera ? { imagenCabecera } : {}),
      ...(reemplazo ? { archivoReemplazo: reemplazo.archivo } : {}),
    };
  }

  const integration = await getIntegrationWithToken(tenantId);

  if (plantilla) {
    const payload = await buildTemplatePayload(
      tenantId,
      plantilla.templateId,
      plantilla.parametros,
      plantilla.imagenCabecera
        ? { tipo: 'image', metaMediaId: plantilla.imagenCabecera.metaMediaId }
        : undefined,
    );
    const { messageId } = await metaWhatsAppClient.sendTemplate(
      cliente.telefono,
      payload.name,
      payload.langCode,
      payload.components,
      integration.phoneNumberId,
      integration.accessToken,
    );

    const { campaignId } = contexto;
    // HU-MARK-05 · la imagen que el cliente vio de verdad: la propia de la campaña, la de reemplazo
    // de un envío suelto o, sin ninguna de las dos, la por defecto de la plantilla (HT-WA-04).
    const archivoCabecera =
      contexto.mediaCabecera ?? plantilla.archivoReemplazo ?? payload.imagenDefecto;
    const message = await createScoped(Message, tenantId, {
      clienteId: new Types.ObjectId(clienteId),
      canal: 'whatsapp',
      direccion: 'outbound',
      // Los envíos por plantilla se atribuyen a 'bot': son un mensaje automatizado/aprobado por
      // Meta, no texto libre redactado por el agente, aunque los haya disparado un admin.
      sender: 'bot',
      // Se queda `plantilla` aunque lleve imagen: el presupuesto de 24 h del tier de Meta cuenta
      // por este `tipo` (HU-MARK-01). La bandeja deduce cómo pintarlo de `media.mimeType`.
      tipo: 'plantilla',
      // HU-MARK-05: lo que el cliente leyó de verdad. Antes no se guardaba nada y la burbuja
      // salía como "Mensaje sin contenido".
      ...(payload.texto ? { texto: payload.texto } : {}),
      plantilla: {
        templateId: new Types.ObjectId(plantilla.templateId),
        nombre: payload.name,
        idioma: payload.langCode,
        parametros: plantilla.parametros,
      },
      ...(campaignId ? { origen: 'campana', campaignId: new Types.ObjectId(campaignId) } : {}),
      // La imagen ya está en nuestro almacenamiento: nace `disponible` y se reutiliza su clave,
      // sin copiar el archivo.
      ...(archivoCabecera && payload.cabeceraMetaMediaId
        ? {
            media: {
              estado: 'disponible' as const,
              mimeType: archivoCabecera.mimeType,
              mediaKey: archivoCabecera.mediaKey,
              metaMediaId: payload.cabeceraMetaMediaId,
              tamanoBytes: archivoCabecera.tamanoBytes,
              descargadaAt: new Date(),
            },
          }
        : {}),
      metaMessageId: messageId,
      status: 'sent',
    } as Record<string, unknown>);

    await incrementUsage(tenantId, 'mensajesMes');
    return message;
  }

  const { messageId } = await metaWhatsAppClient.sendText(
    cliente.telefono,
    texto as string,
    integration.phoneNumberId,
    integration.accessToken,
  );

  const message = await createScoped(Message, tenantId, {
    clienteId: new Types.ObjectId(clienteId),
    canal: 'whatsapp',
    direccion: 'outbound',
    sender,
    tipo: 'texto',
    texto,
    metaMessageId: messageId,
    status: 'sent',
  } as Record<string, unknown>);

  // Contabiliza el mensaje outbound en la cuota mensual del tenant.
  await incrementUsage(tenantId, 'mensajesMes');

  return message;
}

export async function sendMessage(
  tenantId: TenantId,
  dto: ISendMessageDto,
): Promise<IMessageDocument> {
  // `dto.sender` se propaga a propósito: es lo que distingue la respuesta automática de Sofi
  // (`'bot'`) de la de un asesor (`'agent'`, el default de `sendOutbound`). Perderlo aquí guarda
  // todo como 'agent' y rompe HU-IA-01 en la bandeja, la auditoría y el transcript del resumen.
  return sendOutbound(tenantId, dto.clienteId, { modo: 'texto', texto: dto.texto }, dto.sender);
}

/**
 * Desde qué estados se puede llegar a cada uno (HU-MARK-05). Meta no garantiza el orden de los
 * `statuses`: un `delivered` puede llegar después del `read`, y sin esta tabla el tick retrocedía.
 * `failed` no pisa `read`: si el cliente lo leyó, llegó.
 */
const ESTADOS_PREVIOS: Readonly<Record<MessageStatus, readonly MessageStatus[]>> = {
  sent: [],
  delivered: ['sent'],
  read: ['sent', 'delivered'],
  failed: ['sent', 'delivered'],
};

export async function updateDeliveryStatus(
  tenantId: TenantId,
  metaMessageId: string,
  status: MessageStatus,
): Promise<void> {
  // Atómico: el filtro por estado previo decide si avanza, sin leer antes (dos webhooks
  // simultáneos no pueden cruzarse).
  const actualizado = await findOneAndUpdateScoped(
    Message,
    tenantId,
    { metaMessageId, status: { $in: ESTADOS_PREVIOS[status] } },
    { $set: { status } },
    { new: true },
  ).lean();

  if (actualizado) {
    // Ticks en vivo: el hilo reemplaza el mensaje por `id` (mismo evento que la media, HU-OMNI-06).
    const fuente = actualizado as unknown as IMessageSource;
    const campanas = fuente.campaignId
      ? await getNombresCampanas(tenantId, [fuente.campaignId])
      : new Map<string, string>();
    await publishRealtime({
      type: 'message:updated',
      tenantId: String(tenantId),
      conversationId: String(actualizado.clienteId),
      message: toMessageResponse(fuente, String(tenantId), campanas),
    });
  }

  // Los `statuses` de Meta entran por un único camino (el webhook → esta función), así que el
  // destinatario de campaña se actualiza aquí en vez de duplicar el parseo en otro sitio. Es un
  // no-op para los mensajes que no pertenecen a ninguna campaña, que son la mayoría (HU-MARK-01).
  await applyDeliveryStatusToRecipient(tenantId, metaMessageId, status);
}
