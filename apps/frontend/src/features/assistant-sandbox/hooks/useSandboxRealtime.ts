import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../../../lib/socket.js';
import type { SandboxEffectEvent, SandboxMessageEvent, SandboxSession } from '../types.js';
import { useSandboxStore } from '../useSandboxStore.js';
import { SANDBOX_SESSION_KEY, upsertMensaje } from './useSandboxSession.js';

/** Si en este tiempo no llega respuesta, se deja de mostrar «escribiendo…» en vez de mentir. */
const TIMEOUT_ESCRIBIENDO_MS = 30_000;

/**
 * Suscribe el chat de prueba a `sandbox:message` y `sandbox:effect` (HU-IA-08). Ambos eventos llegan
 * solo al socket del admin que prueba (room `asesor:<id>`), nunca a los demás del tenant.
 *
 * Como `useInboxRealtime`, no es dueño de la conexión: toma la instancia abierta por
 * `useNotificationsRealtime` y su cleanup no la desconecta.
 */
export function useSandboxRealtime(): void {
  const qc = useQueryClient();
  const esperando = useSandboxStore((s) => s.esperandoRespuesta);
  const setEsperando = useSandboxStore((s) => s.setEsperandoRespuesta);

  useEffect(() => {
    const socket = getSocket();

    const onMessage = (evt: SandboxMessageEvent): void => {
      qc.setQueryData<SandboxSession>(SANDBOX_SESSION_KEY, (prev) => upsertMensaje(prev, evt.message));
      // Una respuesta de Sofi o del flujo cierra el «escribiendo…». El eco del propio mensaje del
      // admin (`inbound`) no: sigue habiendo algo por llegar.
      if (evt.message.direccion === 'outbound') setEsperando(false);
    };

    const onEffect = (evt: SandboxEffectEvent): void => {
      useSandboxStore.getState().registrarEfecto(evt.efecto, evt.at);
      // La sesión guarda lo que no viaja en el evento: si Sofi quedó apagada, o si hay una espera.
      if (['handoff', 'espera', 'flujo_fin'].includes(evt.efecto.tipo)) {
        void qc.invalidateQueries({ queryKey: SANDBOX_SESSION_KEY });
      }
      if (evt.efecto.tipo === 'handoff' || evt.efecto.tipo === 'espera' || evt.efecto.tipo === 'flujo_fin') {
        setEsperando(false);
      }
    };

    socket.on('sandbox:message', onMessage);
    socket.on('sandbox:effect', onEffect);
    return () => {
      socket.off('sandbox:message', onMessage);
      socket.off('sandbox:effect', onEffect);
    };
  }, [qc, setEsperando]);

  useEffect(() => {
    if (!esperando) return;
    const id = setTimeout(() => setEsperando(false), TIMEOUT_ESCRIBIENDO_MS);
    return () => clearTimeout(id);
  }, [esperando, setEsperando]);
}
