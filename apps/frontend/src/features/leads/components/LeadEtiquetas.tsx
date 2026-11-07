import { TagChip } from '@/features/tags/components/TagChip';
import type { TagDTO } from '@/features/tags/types';

interface Props {
  etiquetas: TagDTO[] | undefined;
  /** Cuántas chips caben; el resto se resume en «+N». Sin tope = todas. */
  max?: number;
  /** Texto cuando no hay ninguna. Sin él, un guion: en una celda de tabla basta. */
  vacio?: string;
}

/**
 * Etiquetas del contacto de un lead (HU-MARK-07): las que se le pusieron en la bandeja y las que le
 * dejaron las campañas, en el mismo orden en que las tiene. Es la misma forma en la tabla, en la
 * tarjeta del embudo y en la ficha, para que una etiqueta se reconozca igual en los tres sitios.
 */
export function LeadEtiquetas({ etiquetas, max, vacio }: Props): React.ReactElement {
  const todas = etiquetas ?? [];
  if (todas.length === 0) {
    return vacio ? (
      <p className="text-sm text-muted-foreground">{vacio}</p>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }

  const visibles = max === undefined ? todas : todas.slice(0, max);
  const resto = todas.slice(visibles.length);

  return (
    <ul className="flex min-w-0 flex-wrap items-center gap-1" aria-label="Etiquetas">
      {visibles.map((t) => (
        <li key={t.id} className="min-w-0 max-w-full">
          <TagChip tag={t} className="max-w-40" />
        </li>
      ))}
      {resto.length > 0 ? (
        <li
          className="text-xs tabular-nums text-muted-foreground"
          // Las que no caben se nombran al pasar el ratón: «+2» solo no dice cuáles.
          title={resto.map((t) => t.nombre).join(', ')}
        >
          +{resto.length}
        </li>
      ) : null}
    </ul>
  );
}
