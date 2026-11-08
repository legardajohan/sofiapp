import type { IArista, INodo, ITriggerFlow } from '../types.js';

/**
 * Borrador local del flujo (HU-FLOW-05, criterio 30). Es una red de seguridad: si se cae la conexión
 * o se cierra la pestaña antes de guardar, lo que había en el editor se puede recuperar al volver.
 * Nunca se activa ni se envía solo.
 *
 * `localStorage` puede estar bloqueado (modo privado, política del navegador) o lleno: TODO acceso
 * va dentro de `try/catch` y, si falla, el editor funciona igual, solo sin red de seguridad.
 */
export interface BorradorFlujo {
  nombre: string;
  nodos: INodo[];
  aristas: IArista[];
  entrada: string;
  trigger: ITriggerFlow;
  /** Marca de tiempo (ms) del último cambio local. */
  guardadoEn: number;
}

/** Una clave por usuario y flujo: dos admins en el mismo navegador no se pisan los borradores. */
export function claveBorrador(usuarioId: string | undefined, flowId: string | undefined): string {
  return `flow-draft:${usuarioId ?? 'anon'}:${flowId ?? 'nuevo'}`;
}

export function leerBorrador(clave: string): BorradorFlujo | null {
  try {
    const crudo = window.localStorage.getItem(clave);
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as Partial<BorradorFlujo>;
    // Un borrador de otra versión del editor o corrupto se descarta en vez de romper la pantalla.
    if (!Array.isArray(dato.nodos) || !Array.isArray(dato.aristas) || typeof dato.guardadoEn !== 'number') return null;
    return dato as BorradorFlujo;
  } catch {
    return null;
  }
}

export function guardarBorrador(clave: string, borrador: BorradorFlujo): void {
  try {
    window.localStorage.setItem(clave, JSON.stringify(borrador));
  } catch {
    // Sin almacenamiento disponible: se sigue sin red de seguridad.
  }
}

export function borrarBorrador(clave: string): void {
  try {
    window.localStorage.removeItem(clave);
  } catch {
    // Nada que borrar si no hay almacenamiento.
  }
}

export interface ContenidoFlujo {
  nombre: string;
  nodos: INodo[];
  aristas: IArista[];
  entrada: string;
}

/** ¿Dos versiones del flujo tienen el mismo contenido? Las aristas se comparan por sus extremos: los
 *  ids de las aristas nuevas cambian de una sesión a otra y no aportan nada. */
export function mismoContenido(a: ContenidoFlujo, b: ContenidoFlujo): boolean {
  const extremos = (aristas: IArista[]): string =>
    JSON.stringify(aristas.map(({ from, to }) => ({ from, to })));
  return (
    a.nombre === b.nombre &&
    a.entrada === b.entrada &&
    JSON.stringify(a.nodos) === JSON.stringify(b.nodos) &&
    extremos(a.aristas) === extremos(b.aristas)
  );
}

/** ¿El borrador es más reciente que lo guardado en el servidor y distinto de ello? */
export function borradorEsMasNuevo(
  borrador: BorradorFlujo,
  servidor: ContenidoFlujo & { updatedAt?: string },
): boolean {
  const guardadoServidor = servidor.updatedAt ? Date.parse(servidor.updatedAt) : 0;
  if (borrador.guardadoEn <= guardadoServidor) return false;
  return !mismoContenido(borrador, servidor);
}
