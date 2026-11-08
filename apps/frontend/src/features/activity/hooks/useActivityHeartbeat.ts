import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { enviarLatido } from '../api.js';

/**
 * Cada cuánto late una pestaña activa. Debe coincidir con `ACTIVITY_HEARTBEAT_MS` del backend: si el
 * navegador latiera más despacio, cada latido parecería el primero tras un hueco y el tiempo saldría
 * recortado.
 */
export const HEARTBEAT_MS = 60_000;

/** Sin interacción durante este tiempo, el asesor deja de contar como activo (spec HU-REP-06). */
export const IDLE_MS = 5 * 60_000;

/** Lo que cuenta como «el asesor está usando SofiApp». `pointermove` no: un ratón que se desliza solo no es trabajo. */
const EVENTOS_INTERACCION = ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart', 'focus'] as const;

/**
 * Tiempo activo del asesor (HU-REP-06): mientras la pestaña está visible y hubo interacción en los
 * últimos `IDLE_MS`, avisa al servidor cada `HEARTBEAT_MS`. Cada latido afirma «estuve activo el
 * último intervalo», así que nunca se late por adelantado:
 *
 *  - Al ocultarse la pestaña se pierde, como mucho, el tramo desde el último latido.
 *  - Al volver a la pestaña el ciclo se reinicia y el primer latido sale un intervalo después.
 *    Latir en el acto acreditaría el minuto en que la pestaña estuvo oculta.
 *
 * Se monta una vez por sesión en `AppLayout`. Solo late un `admin`: el superadmin no tiene tenant y
 * el endpoint lo rechazaría. Los fallos se ignoran: un latido perdido es un minuto sin contar, no un
 * error que mostrar (y un 401 ya lo maneja el `apiClient`).
 */
export function useActivityHeartbeat(): void {
  const esAsesor = useAuthStore((s) => s.status === 'authenticated' && s.user?.rol === 'admin');

  useEffect(() => {
    if (!esAsesor) return undefined;

    let ultimaInteraccion = Date.now();
    let temporizador: ReturnType<typeof setInterval> | null = null;

    const activo = (): boolean =>
      document.visibilityState === 'visible' && Date.now() - ultimaInteraccion < IDLE_MS;

    const tick = (): void => {
      if (activo()) void enviarLatido().catch(() => undefined);
    };

    const arrancar = (): void => {
      if (temporizador) clearInterval(temporizador);
      temporizador = setInterval(tick, HEARTBEAT_MS);
    };

    const alInteractuar = (): void => {
      ultimaInteraccion = Date.now();
    };

    const alCambiarVisibilidad = (): void => {
      if (document.visibilityState === 'visible') {
        // Volver a la pestaña es interacción (el «foco de ventana» del spec).
        ultimaInteraccion = Date.now();
        arrancar();
      } else if (temporizador) {
        clearInterval(temporizador);
        temporizador = null;
      }
    };

    for (const evento of EVENTOS_INTERACCION) window.addEventListener(evento, alInteractuar, { passive: true });
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    if (document.visibilityState === 'visible') arrancar();

    return () => {
      if (temporizador) clearInterval(temporizador);
      for (const evento of EVENTOS_INTERACCION) window.removeEventListener(evento, alInteractuar);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, [esAsesor]);
}
