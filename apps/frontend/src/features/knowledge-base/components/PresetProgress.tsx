import { Check } from 'lucide-react';
import type { KbProgress } from '../lib/kb-presets.js';

/**
 * Barra de progreso global de la KB en el header: refuerza la sensación de avance. Construida con
 * Tailwind (sin primitivo nuevo) y expuesta como `progressbar` accesible.
 */
export function PresetProgress({ progress }: { progress: KbProgress }): React.ReactElement | null {
  const { totalPresets, completedPresets, obligatorios, completedObligatorios } = progress;
  if (totalPresets === 0) return null;

  const pct = Math.round((completedPresets / totalPresets) * 100);
  const obligatoriosDone = obligatorios.length > 0 && completedObligatorios === obligatorios.length;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">
          {completedPresets}/{totalPresets} documentos completados
        </span>
        {obligatorios.length > 0 && (
          <span
            className={`inline-flex items-center gap-1 font-medium ${
              obligatoriosDone ? 'text-success' : 'text-muted-foreground'
            }`}
          >
            {obligatoriosDone && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
            {completedObligatorios}/{obligatorios.length} obligatorios
          </span>
        )}
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={completedPresets}
        aria-valuemin={0}
        aria-valuemax={totalPresets}
        aria-label="Documentos de la base de conocimiento completados"
      >
        <div
          className="h-full rounded-full bg-success transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
