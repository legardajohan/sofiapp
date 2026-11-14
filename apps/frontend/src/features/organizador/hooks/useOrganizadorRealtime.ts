import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../../../lib/socket.js';
import { PENDIENTES_KEY } from '@/features/contacts/hooks/useNotas';
import { ORGANIZADOR_KEY, usePuedeUsarOrganizador } from './useOrganizador.js';

/**
 * Tiempo real del Organizador (HU-PDF-02). Va en `AppLayout`, sobre el mismo socket de sesión que
 * la campana.
 *
 * - `pendiente:vencido` llega solo al autor de la nota: refresca su pila y su campana.
 * - `pendiente:updated` llega a todo el tenant: retira el aviso en las demás pestañas del usuario
 *   y refresca el Organizador y la columna del embudo de los compañeros.
 *
 * Ningún evento lleva el texto de la nota; solo dicen «pregunta otra vez». Sin toast: los toasts
 * caducan, y un recordatorio no debe caducar.
 */
export function useOrganizadorRealtime(): void {
  const qc = useQueryClient();
  const puede = usePuedeUsarOrganizador();

  useEffect(() => {
    if (!puede) return;
    const socket = getSocket();
    const refrescar = (): void => {
      void qc.invalidateQueries({ queryKey: ORGANIZADOR_KEY });
      void qc.invalidateQueries({ queryKey: PENDIENTES_KEY });
    };
    socket.on('pendiente:vencido', refrescar);
    socket.on('pendiente:updated', refrescar);
    return () => {
      socket.off('pendiente:vencido', refrescar);
      socket.off('pendiente:updated', refrescar);
    };
  }, [qc, puede]);
}
