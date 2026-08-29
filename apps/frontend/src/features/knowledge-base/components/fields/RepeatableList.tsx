import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RepeatableListProps<T> {
  items: T[];
  onChange: (items: T[]) => void;
  /** Cómo nace un ítem recién añadido. */
  crearItem: () => T;
  maxItems: number;
  /** Copy del botón, en voz activa y con el sustantivo real: «Añadir zona», no «Añadir ítem». */
  etiquetaAgregar: string;
  /** Qué se lee cuando todavía no hay ninguno. Es una invitación, no un lamento. */
  vacio: string;
  /** Nombre del ítem para el `aria-label` de quitar: «Quitar zona 2». */
  nombreItem: string;
  renderItem: (item: T, index: number, onItemChange: (siguiente: T) => void) => React.ReactNode;
}

/**
 * Lista de ítems que el admin añade y quita. Genérica sobre la forma del ítem: quien la usa decide
 * qué se pinta en cada fila, y esta solo se ocupa del alta, la baja y el tope.
 *
 * Los ítems se identifican **por posición**, no por un id sintético: son datos planos que se
 * serializan en el orden ingresado, y añadir una clave artificial solo para React ensuciaría el
 * JSON que se guarda.
 */
export function RepeatableList<T>({
  items,
  onChange,
  crearItem,
  maxItems,
  etiquetaAgregar,
  vacio,
  nombreItem,
  renderItem,
}: RepeatableListProps<T>): React.ReactElement {
  const lleno = items.length >= maxItems;

  function actualizar(index: number, siguiente: T): void {
    onChange(items.map((item, i) => (i === index ? siguiente : item)));
  }

  function quitar(index: number): void {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          {vacio}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            // La posición ES la identidad del ítem (ver la nota del encabezado), así que el índice
            // como `key` no es aquí el antipatrón habitual.
            <li key={index} className="flex items-start gap-2">
              <div className="flex-1">{renderItem(item, index, (siguiente) => actualizar(index, siguiente))}</div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-0.5 shrink-0 text-muted-foreground hover:bg-destructive-subtle hover:text-destructive"
                onClick={() => quitar(index)}
                aria-label={`Quitar ${nombreItem} ${index + 1}`}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, crearItem()])}
          disabled={lleno}
        >
          <Plus className="size-4" aria-hidden="true" />
          {etiquetaAgregar}
        </Button>
        {lleno && (
          <span className="text-xs text-muted-foreground">
            Llegaste al máximo de {maxItems}.
          </span>
        )}
      </div>
    </div>
  );
}
