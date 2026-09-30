import type { RequestHandler } from 'express';
import { AppError } from '../../utils/AppError.js';
import {
  aplicarSemaforoSugerido,
  listClasificaciones,
} from '../ai/ai-semaforo.service.js';
import { puedeVerDatosSensibles } from '../../middlewares/authorize-subrol.middleware.js';
import {
  assignConversation,
  generateConversationSummary,
  getConversationOverview,
  getThread,
  listAssignments,
  listConversations,
  markRead,
  getConfigAudio,
  replyAudioMessage,
  replyMediaMessage,
  replyMessage,
  setConversationTags,
  setIaHabilitada,
} from './conversation.service.js';
import type {
  AssignBody,
  AssignmentsQuery,
  ClassificationsQuery,
  IaBody,
  ListConversationsQuery,
  ReplyAudioBody,
  ReplyBody,
  TagsBody,
  ThreadQuery,
} from './conversation.validation.js';

export const listConversationsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const asesorId = req.user!.sub;
  const result = await listConversations(
    tenantId,
    asesorId,
    req.validatedQuery as unknown as ListConversationsQuery,
  );
  res.status(200).json(result);
};

export const getThreadController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const result = await getThread(tenantId, id, req.validatedQuery as unknown as ThreadQuery);
  res.status(200).json(result);
};

/**
 * Vista unificada de la conversación (HU-IA-04). El permiso se resuelve AQUÍ, del token, y se pasa
 * al service: el service no conoce `req`, y el subrol no puede llegar del cliente.
 */
export const getOverviewController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const overview = await getConversationOverview(tenantId, id, puedeVerDatosSensibles(req.user!));
  res.status(200).json(overview);
};

export const replyController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const { texto } = req.body as ReplyBody;
  const message = await replyMessage(tenantId, id, texto);
  res.status(201).json(message);
};

/**
 * Envío de un archivo desde el composer (HU-OMNI-06).
 *
 * `req.file` lo deja `subirArchivo` (multer). No lo valida Zod: es un `Buffer`, no encaja en un
 * schema, y la regla de qué mime y qué tamaño se aceptan vive en `media.service`.
 */
export const replyMediaController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const archivo = req.file;

  if (!archivo) throw new AppError('Falta el archivo a enviar.', 400);

  const { texto } = req.body as { texto?: string };
  const message = await replyMediaMessage(
    tenantId,
    id,
    {
      buffer: archivo.buffer,
      mimeType: archivo.mimetype,
      // `originalname` es texto del navegador: se usa como etiqueta para Meta y para el hilo,
      // nunca para construir una ruta de almacenamiento.
      nombreArchivo: archivo.originalname,
    },
    texto,
  );

  res.status(201).json(message);
};

/**
 * Envío de una nota de voz grabada en el navegador (HU-OMNI-07).
 *
 * `req.file` lo deja `subirAudio`. El nombre del archivo del navegador se ignora: la grabación sale
 * transcodificada y con un nombre fijo, así que no hay nada del usuario que conservar.
 */
export const replyAudioController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const grabacion = req.file;

  if (!grabacion) throw new AppError('Falta la grabación a enviar.', 400);

  const { duracionSegundos } = req.body as ReplyAudioBody;
  const message = await replyAudioMessage(
    tenantId,
    id,
    { buffer: grabacion.buffer, mimeType: grabacion.mimetype, nombreArchivo: 'nota-de-voz' },
    duracionSegundos,
  );

  res.status(201).json(message);
};

export const getConfigAudioController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.json(await getConfigAudio(tenantId));
};

export const markReadController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const conversation = await markRead(tenantId, id);
  res.status(200).json(conversation);
};

export const setIaController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const { habilitada } = req.body as IaBody;
  const conversation = await setIaHabilitada(tenantId, id, habilitada);
  res.status(200).json(conversation);
};

export const setTagsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const { tagIds } = req.body as TagsBody;
  const conversation = await setConversationTags(tenantId, id, tagIds);
  res.status(200).json(conversation);
};

export const generateSummaryController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const resumen = await generateConversationSummary(tenantId, id);
  res.status(200).json(resumen);
};

export const assignController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const actorId = req.user!.sub;
  const id = req.params['id'] as string;
  const { asignadoA } = req.body as AssignBody;
  const conversation = await assignConversation(tenantId, actorId, id, asignadoA);
  res.status(200).json(conversation);
};

export const listAssignmentsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const result = await listAssignments(
    tenantId,
    id,
    req.validatedQuery as unknown as AssignmentsQuery,
  );
  res.status(200).json(result);
};

/**
 * Aplica la sugerencia de semáforo que dejó la IA (HU-IA-05). El `actorId` sale del token: la
 * bitácora tiene que registrar a quien pulsó, no al sistema.
 */
export const aplicarSemaforoController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const actorId = req.user!.sub;
  const id = req.params['id'] as string;
  await aplicarSemaforoSugerido(tenantId, id, actorId);
  res.status(200).json(await getConversationOverview(tenantId, id, puedeVerDatosSensibles(req.user!)));
};

export const listClassificationsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const { page, limit } = req.validatedQuery as unknown as ClassificationsQuery;
  res.status(200).json(await listClasificaciones(tenantId, id, page, limit));
};
