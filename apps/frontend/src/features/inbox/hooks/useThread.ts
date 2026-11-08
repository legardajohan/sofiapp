import { useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  fetchConfigAudio,
  fetchThread,
  markConversationRead,
  reintentarMedia,
  sendAudioReply,
  sendMediaReply,
  sendReply,
  setSofiEnabled,
} from '../api.js';
import { errorMessage } from '../lib/errors.js';
import { STATUS_KEY } from '@/features/send-window/hooks/useSendWindowStatus.js';
import { aperturaDeVentanaCerrada, textoReapertura } from '@/features/send-window/lib/ventana-cerrada.js';
import type { ConfigAudioDTO, MessageDTO, Paginated } from '../types.js';

export function useThread(conversationId: string | null) {
  return useQuery<Paginated<MessageDTO>>({
    queryKey: ['thread', conversationId],
    queryFn: () => fetchThread(conversationId as string),
    enabled: !!conversationId,
  });
}

/**
 * Error de un envío del asesor. Un 423 es el horario de envío de la empresa (HU-CONF-01): se dice
 * cuándo podrá enviar y se refresca el estado de la ventana, para que el banner aparezca aunque la
 * franja haya cerrado después del último sondeo.
 */
function avisarErrorDeEnvio(qc: QueryClient, titulo: string, error: unknown): void {
  const apertura = aperturaDeVentanaCerrada(error);
  if (apertura !== undefined) {
    void qc.invalidateQueries({ queryKey: STATUS_KEY });
    toast.error('Fuera del horario de envío', { description: textoReapertura(apertura) });
    return;
  }
  toast.error(titulo, { description: errorMessage(error, 'Inténtalo de nuevo.') });
}

export function useSendReply(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (texto: string) => sendReply(conversationId as string, texto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['thread', conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    // Sin esto un envío fallido era SILENCIOSO: el composer ya había vaciado el campo y el asesor
    // veía desaparecer su mensaje sin que llegara a ningún lado ni saber por qué (HU-OMNI-07). El
    // backend manda el motivo ya redactado: ventana de 24 h (422), cuota, o el rechazo de Meta.
    onError: (error: unknown) => {
      avisarErrorDeEnvio(qc, 'No se pudo enviar el mensaje', error);
    },
  });
}

/**
 * Envío de un archivo, con el progreso de subida expuesto para la barra del composer.
 *
 * El progreso vive aquí y no en el componente porque la mutación es quien sabe cuándo empieza y
 * cuándo termina; el composer solo lo pinta.
 */
export function useSendMedia(conversationId: string | null) {
  const qc = useQueryClient();
  const [progreso, setProgreso] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: ({ archivo, caption }: { archivo: File; caption: string }) => {
      setProgreso(0);
      return sendMediaReply(conversationId as string, archivo, caption, setProgreso);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['thread', conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: unknown) => {
      // Sin esto un envío fallido era SILENCIOSO: el asesor veía la ventana seguir abierta sin
      // saber si el problema era el tamaño, el tipo o la ventana de 24 h cerrada. El backend manda
      // el motivo ya redactado en cada caso (413, 415, 422).
      avisarErrorDeEnvio(qc, 'No se pudo enviar el archivo', error);
    },
    onSettled: () => setProgreso(null),
  });

  return { ...mutation, progreso };
}

/**
 * Envío de una nota de voz (HU-OMNI-07). Mismo contrato que `useSendMedia`: progreso para la UI,
 * toast con el motivo que redacta el backend (413, 415, 422 por duración o por la ventana de 24 h)
 * e invalidación del hilo al terminar.
 */
export function useSendAudio(conversationId: string | null) {
  const qc = useQueryClient();
  const [progreso, setProgreso] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: ({ grabacion, duracionSegundos }: { grabacion: Blob; duracionSegundos: number }) => {
      setProgreso(0);
      return sendAudioReply(conversationId as string, grabacion, duracionSegundos, setProgreso);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['thread', conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: unknown) => {
      avisarErrorDeEnvio(qc, 'No se pudo enviar la nota de voz', error);
    },
    onSettled: () => setProgreso(null),
  });

  return { ...mutation, progreso };
}

/**
 * Límite de grabación del tenant. Cambia solo cuando el superadmin lo edita, así que se cachea
 * largo: pedirlo en cada conversación sería una llamada por clic en la bandeja.
 */
export function useConfigAudio() {
  return useQuery<ConfigAudioDTO>({
    queryKey: ['config-audio'],
    queryFn: fetchConfigAudio,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Reintenta la descarga de un archivo que falló.
 *
 * No invalida el hilo: el backend deja la media en `pendiente` y publica `message:updated` cuando
 * termine, así que la burbuja se actualiza sola por el socket.
 */
export function useReintentarMedia(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => reintentarMedia(messageId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['thread', conversationId] }),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => markConversationRead(conversationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

export function useSetSofi(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (habilitada: boolean) => setSofiEnabled(conversationId, habilitada),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['thread', conversationId] });
    },
  });
}
