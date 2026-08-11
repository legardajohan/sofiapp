export type EstadoIndexacion = 'pendiente' | 'procesando' | 'indexado' | 'fallido';

// ─── Conocimiento estructurado (HU-KB-07) ───────────────────────────────────

export type KbTriEstado = 'si' | 'no' | 'na';

/**
 * Un tramo de atención. **Espejo exacto del backend** (`kb.types.ts`), que lo guarda sin
 * interpretarlo.
 *
 * `descripcion` llegó en HU-KB-12 y es **siempre opcional**: las estructuras guardadas antes la
 * traen `undefined` y se leen igual, así que el cambio no obligó a subir `schemaVersion` ni a migrar
 * un solo documento.
 */
export interface KbScheduleInterval {
  desde: string; // 'HH:mm'
  hasta: string; // 'HH:mm'
  /** Para qué es este tramo: «Solo recepción de pedidos». Va en el intervalo, no en el día. */
  descripcion?: string;
}

export interface KbScheduleDay {
  dia: string;
  cerrado: boolean;
  intervalos: KbScheduleInterval[];
}

/**
 * Valor de un campo del formulario guiado. **Auto-descriptivo**: cada valor lleva su discriminante
 * `tipo`, así una versión futura puede leer una `estructura` guardada con un schema viejo sin tener
 * que adivinar cómo interpretarla (y `kb-serialize` puede serializarla igual).
 */
export type KbFieldValue =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'lista'; valores: string[] }
  | { tipo: 'triestado'; valor: KbTriEstado; detalle?: string }
  | { tipo: 'horario'; dias: KbScheduleDay[] }
  | { tipo: 'repetible'; items: Array<Record<string, string>> };

/**
 * Conocimiento capturado campo a campo. **Espejo exacto de `KbEstructura` del backend**, que lo
 * guarda sin interpretarlo: quien la entiende —y quien deriva el `contenido` textual a partir de
 * ella— es este lado. Ver `docs/specs/HU-KB-07-estructura-kb/plan.md`.
 */
export interface KbEstructura {
  /** Versión del CONTRATO de esquema, no del documento. */
  schemaVersion: number;
  /** Qué formulario la produjo. */
  schemaId: string;
  campos: Record<string, KbFieldValue>;
  /** «Información adicional». Obligatorio en el contrato (puede ser ''), nunca ausente. */
  adicional: string;
}

export interface IKbDocument {
  id: string;
  titulo: string;
  contenido: string;
  estadoIndexacion: EstadoIndexacion;
  version: number;
  chunkCount: number;
  isPreset: boolean;
  obligatorio: boolean;
  /** Preset eliminado (soft-delete del backend). El merge lo excluye de la grilla. */
  oculto: boolean;
  proposito?: string;
  error?: string;
  /**
   * Presente solo en documentos con edición guiada. Es lo que decide en qué modo abre el modal:
   * ausente + con texto = documento legado, que conserva su textarea (ver `modoEditor`).
   */
  estructura?: KbEstructura;
  createdAt: string;
  updatedAt: string;
}
