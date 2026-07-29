import { BookOpen } from 'lucide-react';

/**
 * Estado vacío de la tabla cuando no hay documentos con contenido (todos los presets siguen sin
 * llenar). Invita a empezar en vez de mostrar una tabla en blanco.
 */
export function KnowledgeEmptyState(): React.ReactElement {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <BookOpen className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-foreground">Aún no has cargado conocimiento</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Completa los documentos de arriba para que la IA aprenda sobre tu negocio. Empieza por los
        marcados como «Requerido».
      </p>
    </div>
  );
}
