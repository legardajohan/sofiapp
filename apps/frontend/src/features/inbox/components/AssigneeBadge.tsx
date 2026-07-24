import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SUBROL_LABEL } from '@/lib/roles';
import type { AdminSubrol } from '@/stores/authStore';
import { personInitials } from '../lib/format.js';

interface Props {
  nombre: string | null;
  subrol?: AdminSubrol | null;
}

/** Responsable de una conversación: avatar de iniciales + nombre, discreto en la fila de la lista. */
export function AssigneeBadge({ nombre, subrol }: Props): React.ReactElement | null {
  if (!nombre) return null;

  const title = subrol ? `${nombre} · ${SUBROL_LABEL[subrol]}` : nombre;

  return (
    <span className="flex min-w-0 items-center gap-1" title={title}>
      <Avatar className="h-4 w-4 shrink-0">
        <AvatarFallback className="text-[8px] font-medium">{personInitials(nombre)}</AvatarFallback>
      </Avatar>
      <span className="max-w-20 truncate text-[11px] text-muted-foreground">{nombre}</span>
    </span>
  );
}
