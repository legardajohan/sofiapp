import { apiClient } from '../../api/apiClient.js';
import type {
  ContactHistoryDTO,
  ConversationDTO,
  ConversationOverviewDTO,
  DatosExtraidosDTO,
  InboxFiltros,
  MessageDTO,
  Paginated,
  ResumenDTO,
} from './types.js';

export async function fetchConversations(
  filtros: InboxFiltros,
  page = 1,
): Promise<Paginated<ConversationDTO>> {
  const { data } = await apiClient.get<Paginated<ConversationDTO>>('/conversations', {
    params: { ...filtros, page },
  });
  return data;
}

/** Reemplaza el conjunto de etiquetas: aplicar y quitar varias es una sola llamada. */
export async function setConversationTags(
  conversationId: string,
  tagIds: string[],
): Promise<ConversationDTO> {
  const { data } = await apiClient.patch<ConversationDTO>(
    `/conversations/${conversationId}/tags`,
    { tagIds },
  );
  return data;
}

export async function assignConversation(
  conversationId: string,
  asignadoA: string | null,
): Promise<ConversationDTO> {
  const { data } = await apiClient.patch<ConversationDTO>(
    `/conversations/${conversationId}/assign`,
    { asignadoA },
  );
  return data;
}

/**
 * Vista unificada de la conversación (HU-IA-04): cabecera, etiquetas, resumen y permisos.
 * NO trae el hilo: los mensajes paginan por `fetchThread` y llegan en vivo por Socket.IO.
 */
export async function fetchConversationOverview(
  conversationId: string,
): Promise<ConversationOverviewDTO> {
  const { data } = await apiClient.get<ConversationOverviewDTO>(
    `/conversations/${conversationId}/overview`,
  );
  return data;
}

export async function fetchThread(
  conversationId: string,
  page = 1,
): Promise<Paginated<MessageDTO>> {
  const { data } = await apiClient.get<Paginated<MessageDTO>>(
    `/conversations/${conversationId}/messages`,
    { params: { page } },
  );
  return data;
}

export async function sendReply(conversationId: string, texto: string): Promise<MessageDTO> {
  const { data } = await apiClient.post<MessageDTO>(
    `/conversations/${conversationId}/messages`,
    { texto },
  );
  return data;
}

export async function markConversationRead(conversationId: string): Promise<ConversationDTO> {
  const { data } = await apiClient.patch<ConversationDTO>(
    `/conversations/${conversationId}/read`,
  );
  return data;
}

export async function setSofiEnabled(
  conversationId: string,
  habilitada: boolean,
): Promise<ConversationDTO> {
  const { data } = await apiClient.patch<ConversationDTO>(
    `/conversations/${conversationId}/ia`,
    { habilitada },
  );
  return data;
}

/** Ficha del contacto: historial completo + estado del resumen (HU-OMNI-03). */
export async function fetchContactHistory(
  clienteId: string,
  page = 1,
): Promise<ContactHistoryDTO> {
  const { data } = await apiClient.get<ContactHistoryDTO>(`/clientes/${clienteId}/history`, {
    params: { page },
  });
  return data;
}

/**
 * Las dos llamadas de IA son síncronas y esperan al modelo, así que no caben en el timeout global
 * de 10 s del `apiClient` (pensado para peticiones normales). Medido contra la API real, un resumen
 * tarda entre 7 y 26 s porque `gemini-3.6-flash` razona antes de responder. Se sube solo aquí:
 * bajarle la guardia a toda la app por estos dos endpoints sería peor.
 *
 * Va por encima de `LLM_TIMEOUT_MS` del backend (45 s) a propósito — quien debe cortar es el
 * backend, que sabe traducir el fallo a un error con mensaje; si cortara antes el navegador, el
 * usuario vería un error de red genérico y la petición seguiría viva en el servidor.
 */
const TIMEOUT_IA_MS = 60_000;

/** Genera/actualiza el resumen por IA de la conversación (bajo demanda). */
export async function generateSummary(clienteId: string): Promise<ResumenDTO> {
  const { data } = await apiClient.post<ResumenDTO>(
    `/conversations/${clienteId}/summary`,
    undefined,
    { timeout: TIMEOUT_IA_MS },
  );
  return data;
}

/** Extrae nombre completo, correo y teléfono de la conversación con IA (bajo demanda). */
export async function extractContactData(clienteId: string): Promise<DatosExtraidosDTO> {
  const { data } = await apiClient.post<DatosExtraidosDTO>(
    `/clientes/${clienteId}/extract`,
    undefined,
    { timeout: TIMEOUT_IA_MS },
  );
  return data;
}
