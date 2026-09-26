import { apiClient } from '../../api/apiClient.js';
import type {
  CampoExtraido,
  ConfigAudioDTO,
  ConfirmarExtraccionDTO,
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

/**
 * Aplica la sugerencia de semáforo que dejó la IA (HU-IA-05).
 *
 * Sin cuerpo: el destino es el que la IA ya guardó. Devuelve el overview recalculado para que la
 * franja pase a "aplicado" sin esperar a la invalidación.
 */
export async function aplicarSemaforo(conversationId: string): Promise<ConversationOverviewDTO> {
  const { data } = await apiClient.post<ConversationOverviewDTO>(
    `/conversations/${conversationId}/semaforo`,
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

/**
 * Subir 16 MB por una conexión móvil son minutos, no segundos: el `timeout: 10000` global del
 * `apiClient` cortaría la subida a mitad. Mismo precedente que `TIMEOUT_IA_MS`, que sube el tiempo
 * solo en las llamadas que lo necesitan en vez de relajarlo para todas.
 */
const TIMEOUT_SUBIDA_MS = 120_000;

export async function sendMediaReply(
  conversationId: string,
  archivo: File,
  caption: string,
  onProgress?: (porcentaje: number) => void,
): Promise<MessageDTO> {
  const form = new FormData();
  form.append('archivo', archivo);
  if (caption) form.append('texto', caption);

  const { data } = await apiClient.post<MessageDTO>(
    `/conversations/${conversationId}/messages/media`,
    form,
    {
      timeout: TIMEOUT_SUBIDA_MS,
      // Sin `Content-Type` a mano: el navegador tiene que poner el `boundary` del multipart, y
      // fijarlo aquí rompería el parseo en el servidor.
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
      },
    },
  );
  return data;
}

/**
 * Envía una nota de voz grabada en el navegador (HU-OMNI-07). El servidor la transcodifica a
 * `ogg/opus` y mide su duración; `duracionSegundos` es solo la pista del navegador.
 */
export async function sendAudioReply(
  conversationId: string,
  grabacion: Blob,
  duracionSegundos: number,
  onProgress?: (porcentaje: number) => void,
): Promise<MessageDTO> {
  const form = new FormData();
  // El nombre es cosmético (el servidor lo ignora), pero multer necesita uno para tratarlo como
  // archivo y no como campo de texto.
  form.append('audio', grabacion, 'nota-de-voz');
  form.append('duracionSegundos', String(Math.max(1, Math.round(duracionSegundos))));

  const { data } = await apiClient.post<MessageDTO>(
    `/conversations/${conversationId}/messages/audio`,
    form,
    {
      timeout: TIMEOUT_SUBIDA_MS,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
      },
    },
  );
  return data;
}

/** Límite de grabación del tenant: el navegador corta la nota de voz al llegar a él. */
export async function fetchConfigAudio(): Promise<ConfigAudioDTO> {
  const { data } = await apiClient.get<ConfigAudioDTO>('/conversations/config/audio');
  return data;
}

export async function reintentarMedia(messageId: string): Promise<void> {
  await apiClient.post(`/media/${messageId}/reintentar`);
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

/** Extrae nombre, correo, teléfono e interés de la conversación con IA (bajo demanda). */
export async function extractContactData(clienteId: string): Promise<DatosExtraidosDTO> {
  const { data } = await apiClient.post<DatosExtraidosDTO>(
    `/clientes/${clienteId}/extract`,
    undefined,
    { timeout: TIMEOUT_IA_MS },
  );
  return data;
}

/**
 * Pasa a la ficha los datos que la IA propuso (HU-IA-06). El cuerpo dice QUÉ campos, no con qué
 * valor: el valor es el que ya está persistido tras la extracción.
 *
 * Sin `TIMEOUT_IA_MS`: confirmar no llama al modelo, es una escritura en la base.
 */
export async function confirmarDatosExtraidos(
  clienteId: string,
  campos: CampoExtraido[],
): Promise<ConfirmarExtraccionDTO> {
  const { data } = await apiClient.post<ConfirmarExtraccionDTO>(
    `/clientes/${clienteId}/extract/confirm`,
    { campos },
  );
  return data;
}
