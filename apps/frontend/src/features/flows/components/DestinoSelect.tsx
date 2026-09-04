import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OpcionDestino } from './ConditionEditor.js';

interface DestinoSelectProps {
  value: string;
  opcionesDestino: OpcionDestino[];
  onValueChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}

/**
 * Select de "a qué nodo va esto", compartido por `ConditionEditor` e `IntencionForm`. La opción
 * que se muestra es el resumen del nodo destino — para un `mensaje` puede ser su texto completo —
 * así que el contenido desplegado se acota en ancho (`max-w-xs`) y se deja envolver en vez de
 * desbordar en una sola línea sin límite, que es como se veía antes de este ajuste.
 */
export function DestinoSelect({
  value,
  opcionesDestino,
  onValueChange,
  placeholder,
  ariaLabel,
}: DestinoSelectProps): React.ReactElement {
  return (
    <Select value={value || undefined} onValueChange={onValueChange}>
      <SelectTrigger className="h-8 w-full text-xs" aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-w-xs">
        {opcionesDestino.map((op) => (
          <SelectItem key={op.id} value={op.id} className="whitespace-normal break-words text-xs">
            {op.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
