import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../../../lib/socket.js';

/**
 * Suscribe el tablero al gateway Socket.IO: cuando otro administrador mueve una oportunidad, el
 * embudo se actualiza solo (criterio 11 y DoD de la historia).
 *
 * El evento llega **solo** al room `tenant:<id>`, así que si este cliente lo recibe es de su
 * empresa. No hace falta comprobar nada más.
 *
 * A diferencia de `useInboxRealtime`, **no** llama a `disconnectSocket()` al desmontar: el tablero
 * y la tabla son dos pestañas de la misma pantalla, y tirar el socket en cada cambio de pestaña
 * provocaría una reconexión por clic.
 */
export function usePipelineRealtime(): void {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = getSocket();

    const onStageChanged = (): void => {
      void qc.invalidateQueries({ queryKey: ['pipeline'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    };

    socket.on('lead:stage-changed', onStageChanged);

    return () => {
      socket.off('lead:stage-changed', onStageChanged);
    };
  }, [qc]);
}
