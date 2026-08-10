import { Check } from 'lucide-react';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface KnowledgeSectionProps {
  /** Valor del `AccordionItem`; debe ser único dentro del formulario. */
  id: string;
  titulo: string;
  descripcion?: string;
  /** Campos exigibles ya resueltos y total de ellos. Con `total: 0` no se muestra resumen. */
  llenos: number;
  total: number;
  children: React.ReactNode;
}

/**
 * Bloque colapsable del formulario guiado. Se monta dentro de un `<Accordion type="multiple">`,
 * que es quien decide qué secciones están abiertas.
 *
 * El resumen del encabezado (`3 de 5`) existe para que el admin sepa qué le falta **sin** tener que
 * desplegar la sección: con el bloque cerrado, ese contador es la única información disponible.
 */
export function KnowledgeSection({
  id,
  titulo,
  descripcion,
  llenos,
  total,
  children,
}: KnowledgeSectionProps): React.ReactElement {
  const completa = total > 0 && llenos === total;

  return (
    <AccordionItem value={id} className="border-b last:border-b-0">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex flex-1 items-center justify-between gap-3 pr-3">
          <span className="text-left">
            <span className="block">{titulo}</span>
            {descripcion && (
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {descripcion}
              </span>
            )}
          </span>

          {total > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-xs font-normal tabular-nums text-muted-foreground">
              {completa && <Check className="size-3.5 text-success" aria-hidden="true" />}
              {llenos} de {total}
            </span>
          )}
        </span>
      </AccordionTrigger>

      <AccordionContent className="space-y-4 pb-5">{children}</AccordionContent>
    </AccordionItem>
  );
}
