import { AlertTriangle } from 'lucide-react';
import type { IKbDocument } from '../types/index.js';

interface RequiredPresetsBannerProps {
  /** Presets obligatorios que aún no tienen contenido. */
  missing: IKbDocument[];
  /** Abre el primer obligatorio faltante en el modal de edición. */
  onFix: (doc: IKbDocument) => void;
}

/**
 * Aviso persistente (no bloqueante) cuando falta contenido en presets obligatorios. Comunica el
 * impacto sin deshabilitar nada: la validación es blanda por diseño.
 */
export function RequiredPresetsBanner({
  missing,
  onFix,
}: RequiredPresetsBannerProps): React.ReactElement | null {
  if (missing.length === 0) return null;

  const nombres = missing.map((doc) => `«${doc.titulo}»`).join(' y ');

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-400/50 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-medium">Faltan datos obligatorios</p>
        <p className="mt-0.5 text-amber-700 dark:text-amber-300/90">
          La IA no podrá responder con precisión sobre tu negocio hasta que completes {nombres}.
        </p>
      </div>
      <button
        type="button"
        onClick={() => onFix(missing[0]!)}
        className="flex-shrink-0 rounded-lg border border-amber-400/60 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400/40 dark:text-amber-100 dark:hover:bg-amber-900/40"
      >
        Completar
      </button>
    </div>
  );
}
