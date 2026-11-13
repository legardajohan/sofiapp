import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { TagChip } from '@/features/tags/components/TagChip';
import { TagSelector } from '@/features/tags/components/TagSelector';
import { useTags } from '@/features/tags/hooks/useTags';

interface Props {
  value: string[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
}

/**
 * Etiquetas a aplicar al cliente al cerrar o posponer (HU-PDF-02 §5.3, §6.3). Reutiliza el selector
 * de la bandeja —mismo catálogo, mismos chips— en modo controlado: nada se guarda hasta confirmar,
 * y entonces se **añaden** a las que el cliente ya tiene.
 */
export function EtiquetasCliente({ value, onChange, disabled = false }: Props): React.ReactElement {
  const { data: tags } = useTags();
  const elegidas = useMemo(
    () => (tags ?? []).filter((t) => value.includes(t.id)),
    [tags, value],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">Etiquetas del cliente</Label>
        <TagSelector aplicadas={elegidas} pending={disabled} onChange={onChange} />
      </div>
      {elegidas.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {elegidas.map((t) => (
            <TagChip
              key={t.id}
              tag={t}
              onRemove={disabled ? undefined : () => onChange(value.filter((id) => id !== t.id))}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Opcional. Se suman a las etiquetas que el cliente ya tiene.
        </p>
      )}
    </div>
  );
}
