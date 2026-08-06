import { Check } from 'lucide-react';
import type { KbProgress } from '../lib/kb-presets.js';

/**
 * Progreso global de la KB en el encabezado, con dos lecturas distintas y deliberadas:
 *  - **obligatorios**: denominador fijo (2). Es la puerta que hay que cruzar para que la IA
 *    responda con criterio, así que se muestra primero y se marca con un check al cerrarse.
 *  - **documentos indexados**: denominador dinámico, crece con cada conocimiento propio que crea el
 *    admin. Mide volumen, no obligación — por eso va a la derecha, en tono secundario.
 */
export function PresetProgress({ progress }: { progress: KbProgress }): React.ReactElement | null {
  const { obligatorios, completedObligatorios, totalDocumentos, completedDocumentos } = progress;
  if (totalDocumentos === 0) return null;

  const pct = Math.round((completedDocumentos / totalDocumentos) * 100);
  const obligatoriosDone = obligatorios.length > 0 && completedObligatorios === obligatorios.length;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        {obligatorios.length > 0 && (
          <span
            className={`inline-flex items-center gap-1 font-medium ${
              obligatoriosDone ? 'text-success' : 'text-foreground'
            }`}
          >
            {obligatoriosDone && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
            {completedObligatorios}/{obligatorios.length} obligatorios completados
          </span>
        )}
        <span className="tabular-nums text-muted-foreground">
          {completedDocumentos}/{totalDocumentos} documentos indexados
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={completedDocumentos}
        aria-valuemin={0}
        aria-valuemax={totalDocumentos}
        aria-label="Documentos de la base de conocimiento indexados"
      >
        <div
          className="h-full rounded-full bg-success transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
