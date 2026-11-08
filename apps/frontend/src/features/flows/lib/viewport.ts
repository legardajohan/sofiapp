import type { Viewport } from '@xyflow/react';

/** Clave en `localStorage` del encuadre de un flujo, por usuario (como el borrador). */
export function claveVista(usuarioId: string | undefined, flowId: string | undefined): string {
  return `sofiapp:flow-vista:${usuarioId ?? 'anon'}:${flowId ?? 'nuevo'}`;
}

function esVista(v: unknown): v is Viewport {
  if (typeof v !== 'object' || v === null) return false;
  const { x, y, zoom } = v as Record<string, unknown>;
  return [x, y, zoom].every((n) => typeof n === 'number' && Number.isFinite(n)) && (zoom as number) > 0;
}

/** Lee el encuadre guardado, o `null` si no hay, está corrupto o el almacenamiento no está disponible. */
export function leerVista(clave: string): Viewport | null {
  try {
    const crudo = window.localStorage.getItem(clave);
    if (!crudo) return null;
    const v: unknown = JSON.parse(crudo);
    return esVista(v) ? v : null;
  } catch {
    return null;
  }
}

export function guardarVista(clave: string, vista: Viewport): void {
  try {
    window.localStorage.setItem(clave, JSON.stringify({ x: vista.x, y: vista.y, zoom: vista.zoom }));
  } catch {
    // Sin almacenamiento (modo privado, cuota): el encuadre simplemente no se recuerda.
  }
}
