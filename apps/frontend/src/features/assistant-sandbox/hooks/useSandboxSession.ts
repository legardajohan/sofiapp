import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { MessageDTO } from '../../inbox/types.js';
import {
  advanceSandboxWait,
  fetchSandboxSession,
  resetSandboxSession,
  selectSandboxFlow,
  sendSandboxMessage,
} from '../api.js';
import type { SandboxSession } from '../types.js';
import { useSandboxStore } from '../useSandboxStore.js';

export const SANDBOX_SESSION_KEY = ['sandbox', 'session'] as const;

export function useSandboxSession(): UseQueryResult<SandboxSession> {
  // Sin refetch al volver a la pestaña: el socket mantiene el hilo al día, y recargar a mitad de una
  // respuesta haría parpadear mensajes que acaban de llegar.
  return useQuery({
    queryKey: SANDBOX_SESSION_KEY,
    queryFn: fetchSandboxSession,
    refetchOnWindowFocus: false,
  });
}

/** Añade un mensaje al hilo en caché sin duplicarlo: llega por la respuesta HTTP y por el socket. */
export function upsertMensaje(session: SandboxSession | undefined, message: MessageDTO): SandboxSession | undefined {
  if (!session) return session;
  if (session.mensajes.some((m) => m.id === message.id)) return session;
  return { ...session, mensajes: [...session.mensajes, message] };
}

export function useSendSandboxMessage(): UseMutationResult<MessageDTO, Error, string> {
  const qc = useQueryClient();
  const setEsperando = useSandboxStore((s) => s.setEsperandoRespuesta);

  return useMutation({
    mutationFn: (texto: string) => sendSandboxMessage(texto),
    onMutate: () => setEsperando(true),
    onSuccess: (message) => {
      qc.setQueryData<SandboxSession>(SANDBOX_SESSION_KEY, (prev) => upsertMensaje(prev, message));
    },
    onError: () => {
      setEsperando(false);
      toast.error('No se pudo enviar el mensaje. Inténtalo de nuevo.');
    },
  });
}

export function useSelectSandboxFlow(): UseMutationResult<SandboxSession, Error, string | null> {
  const qc = useQueryClient();
  const limpiar = useSandboxStore((s) => s.limpiar);

  return useMutation({
    mutationFn: (flowId: string | null) => selectSandboxFlow(flowId),
    onSuccess: (session) => {
      // Elegir otro flujo empieza el guion de cero: las tarjetas del anterior ya no explican nada.
      limpiar();
      qc.setQueryData(SANDBOX_SESSION_KEY, session);
    },
    onError: () => toast.error('No se pudo cambiar el flujo de prueba.'),
  });
}

export function useResetSandbox(): UseMutationResult<SandboxSession, Error, void> {
  const qc = useQueryClient();
  const limpiar = useSandboxStore((s) => s.limpiar);

  return useMutation({
    mutationFn: resetSandboxSession,
    onSuccess: (session) => {
      limpiar();
      qc.setQueryData(SANDBOX_SESSION_KEY, session);
    },
    onError: () => toast.error('No se pudo reiniciar la conversación de prueba.'),
  });
}

export function useAdvanceSandboxWait(): UseMutationResult<void, Error, void> {
  const qc = useQueryClient();
  const setEsperando = useSandboxStore((s) => s.setEsperandoRespuesta);

  return useMutation({
    mutationFn: advanceSandboxWait,
    onMutate: () => setEsperando(true),
    onSuccess: () => qc.invalidateQueries({ queryKey: SANDBOX_SESSION_KEY }),
    onError: () => {
      setEsperando(false);
      toast.error('No hay una espera pendiente que avanzar.');
      void qc.invalidateQueries({ queryKey: SANDBOX_SESSION_KEY });
    },
  });
}
