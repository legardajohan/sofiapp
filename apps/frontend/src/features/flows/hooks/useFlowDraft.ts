import { useEffect, useRef } from 'react';
import {
  borrarBorrador,
  guardarBorrador,
  mismoContenido,
  type BorradorFlujo,
  type ContenidoFlujo,
} from '../lib/draft.js';

const ESPERA_MS = 800;

/**
 * Mantiene el borrador local al día mientras se edita (HU-FLOW-05, criterio 30). Escribe con
 * *debounce* para no serializar el grafo en cada tecla, y NO escribe mientras `activo` es `false`
 * (antes de hidratar el editor, o mientras el usuario decide si recupera un borrador anterior).
 *
 * Con `servidor` (un flujo ya guardado), un estado idéntico a lo guardado BORRA el borrador en vez de
 * escribirlo: no tiene sentido ofrecer «recuperar» algo que no se diferencia de lo que ya hay. Sin
 * `servidor` (flujo nuevo) no se escribe un lienzo vacío.
 */
export function useFlowDraft(
  clave: string,
  activo: boolean,
  snapshot: Omit<BorradorFlujo, 'guardadoEn'>,
  servidor: ContenidoFlujo | null,
): void {
  const ultimo = useRef({ snapshot, servidor });
  ultimo.current = { snapshot, servidor };

  useEffect(() => {
    if (!activo) return;
    const temporizador = window.setTimeout(() => {
      const { snapshot: actual, servidor: guardado } = ultimo.current;
      const sinCambios = guardado ? mismoContenido(actual, guardado) : actual.nodos.length === 0;
      if (sinCambios) borrarBorrador(clave);
      else guardarBorrador(clave, { ...actual, guardadoEn: Date.now() });
    }, ESPERA_MS);
    return () => window.clearTimeout(temporizador);
    // `snapshot` cambia de identidad en cada render; lo que dispara el guardado es su contenido.
  }, [clave, activo, snapshot.nombre, snapshot.nodos, snapshot.aristas, snapshot.entrada, snapshot.trigger]);
}
