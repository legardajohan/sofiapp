import type { ResumenSegmentoDTO, SegmentPreviewDTO } from '../types.js';

/** Resumen con todos los tramos presentes: un backend anterior no manda `bloqueados`. */
export type ResumenCompleto = Required<ResumenSegmentoDTO>;

/** El backend anterior al constructor no manda resumen: se reconstruye lo que se sabe. */
export function resumenDe(preview: SegmentPreviewDTO): ResumenCompleto {
  const r = preview.resumen;
  if (!r) {
    return {
      coinciden: preview.total,
      bajas: 0,
      bloqueados: 0,
      excluidosAMano: 0,
      duplicados: 0,
      validos: preview.total,
    };
  }
  return { ...r, bloqueados: r.bloqueados ?? 0 };
}
