import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NOMBRE_EJE, type CriterioAplicado, type EjeSegmento } from '../../lib/segmento.js';
import type { CombinacionSegmento } from '../../types.js';

interface Props {
  criterios: CriterioAplicado[];
  combinacion: CombinacionSegmento;
  /** Sin esto los chips son de solo lectura (paso de revisión). */
  onQuitar?: (eje: EjeSegmento, key: string) => void;
  onLimpiar?: () => void;
  className?: string;
}

/**
 * La fila de criterios activos: lo que define la audiencia, leído de un vistazo y deshecho de un
 * clic. Se agrupan por eje porque dentro de un eje los valores se suman («nuevo o en gestión») y
 * entre ejes se restringen, y mezclarlos en una sola fila escondería esa diferencia.
 */
export function CriteriosAplicados({
  criterios,
  combinacion,
  onQuitar,
  onLimpiar,
  className,
}: Props): React.ReactElement {
  if (criterios.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        Sin criterios: la campaña irá a toda tu base, menos quien pidió no recibir mensajes.
      </p>
    );
  }

  const ejes = [...new Set(criterios.map((c) => c.eje))];
  const unionEtapaEtiqueta =
    combinacion === 'o' && ejes.includes('etapas') && ejes.includes('tagIds');

  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-2', className)}>
      {ejes.map((eje, i) => {
        // El conector cuenta cómo se junta este eje con el anterior. Solo etapas↔etiquetas puede
        // ser «o»: el resto de ejes siempre restringe.
        const conector = i === 0 ? null : eje === 'tagIds' && unionEtapaEtiqueta ? 'o' : 'y';
        return (
          <div key={eje} className="contents">
            {conector ? (
              <span className="text-xs font-medium text-muted-foreground">{conector}</span>
            ) : null}
            <ul aria-label={NOMBRE_EJE[eje]} className="flex flex-wrap items-center gap-1.5">
              {criterios
                .filter((c) => c.eje === eje)
                .map((c) => (
                  <li
                    key={c.key}
                    className="inline-flex h-7 max-w-[16rem] items-center gap-1.5 rounded-full border border-border bg-muted/50 pl-2.5 pr-1 text-xs text-foreground"
                  >
                    {c.color ? (
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                        style={{ backgroundColor: c.color }}
                      />
                    ) : null}
                    <span className="text-muted-foreground">{NOMBRE_EJE[eje]}:</span>
                    <span className="truncate font-medium">{c.label}</span>
                    {onQuitar ? (
                      <button
                        type="button"
                        onClick={() => onQuitar(eje, c.key)}
                        aria-label={`Quitar ${NOMBRE_EJE[eje].toLocaleLowerCase('es')} ${c.label}`}
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:active:scale-90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    ) : (
                      <span className="w-1.5" />
                    )}
                  </li>
                ))}
            </ul>
          </div>
        );
      })}
      {onLimpiar ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onLimpiar}
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          Quitar todos
        </Button>
      ) : null}
    </div>
  );
}
