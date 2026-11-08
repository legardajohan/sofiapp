import { analizarGrafo, nombreDeNodo as nombreGrafo, type ErrorGrafo } from '@sofiapp/shared';
import type { ConfigNodo, INodo } from '../types.js';

/**
 * Análisis del grafo del editor (HU-FLOW-05). Las reglas viven en `@sofiapp/shared` (`analizarGrafo`),
 * las mismas que aplica el servidor al guardar y al activar: aquí solo se adaptan los nodos del
 * editor. Así el rojo/verde de cada nodo y el veredicto del servidor no pueden discrepar.
 */
export function analizarFlujo(
  nodos: INodo[],
  aristas: { from: string; to: string }[],
  entrada: string,
): ErrorGrafo[] {
  return analizarGrafo(nodos, aristas, entrada);
}

/** Agrupa los errores por nodo, conservando el orden en que se reportaron. */
export function agruparPorNodo(errores: ErrorGrafo[]): Map<string, ErrorGrafo[]> {
  const mapa = new Map<string, ErrorGrafo[]>();
  for (const e of errores) mapa.set(e.nodoId, [...(mapa.get(e.nodoId) ?? []), e]);
  return mapa;
}

/** Nombre que se muestra del nodo: el que puso el usuario o, si no, el título de su tipo. */
export function nombreDeNodo(nodo: INodo): string {
  return nombreGrafo(nodo);
}

/**
 * Deja vacíos los destinos de las ramas que apuntaban a alguno de `ids` (HU-FLOW-05, criterio 32):
 * borrar un nodo no puede dejar una rama colgando de un id que ya no existe. Devuelve la MISMA
 * referencia si nada cambia, para no invalidar memos de React al recorrer todo el grafo.
 */
export function configSinDestinos(config: ConfigNodo, ids: ReadonlySet<string>): ConfigNodo {
  const limpio = (destino: string): string => (ids.has(destino) ? '' : destino);
  switch (config.tipo) {
    case 'condicion': {
      if (!config.ramas.some((r) => ids.has(r.nodoDestino)) && !ids.has(config.ramaPorDefecto)) return config;
      return {
        ...config,
        ramas: config.ramas.map((r) => ({ ...r, nodoDestino: limpio(r.nodoDestino) })),
        ramaPorDefecto: limpio(config.ramaPorDefecto),
      };
    }
    case 'intencion': {
      if (!config.etiquetas.some((e) => ids.has(e.nodoDestino)) && !ids.has(config.ramaPorDefecto)) return config;
      return {
        ...config,
        etiquetas: config.etiquetas.map((e) => ({ ...e, nodoDestino: limpio(e.nodoDestino) })),
        ramaPorDefecto: limpio(config.ramaPorDefecto),
      };
    }
    case 'ia': {
      if (!config.salidas.some((s) => ids.has(s.nodoDestino)) && !ids.has(config.ramaPorDefecto)) return config;
      return {
        ...config,
        salidas: config.salidas.map((s) => ({ ...s, nodoDestino: limpio(s.nodoDestino) })),
        ramaPorDefecto: limpio(config.ramaPorDefecto),
      };
    }
    default:
      return config;
  }
}

/**
 * A qué rama pertenece una línea del canvas, o `null` si es una línea lineal. Las líneas de rama se
 * derivan de la config del nodo (no viven en `edges`) y llevan en su `data` el nodo y el handle: es lo
 * que permite que borrarlas con el teclado deje VACÍO el destino de esa rama (HU-FLOW-05, criterio 31).
 */
export function ramaDeLinea(linea: { data?: Record<string, unknown> }): { nodoId: string; handleId: string } | null {
  const nodoId = linea.data?.['nodoId'];
  const handleId = linea.data?.['handleId'];
  return typeof nodoId === 'string' && typeof handleId === 'string' ? { nodoId, handleId } : null;
}
