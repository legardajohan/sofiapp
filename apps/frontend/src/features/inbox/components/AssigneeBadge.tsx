import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { nombreConRol } from '@/lib/roles';
import type { RolEmpresa } from '@/stores/authStore';
import { personInitials } from '../lib/format.js';

interface Props {
  nombre: string | null;
  rolEmpresa?: RolEmpresa | null;
}

/** Responsable de una conversación: avatar de iniciales + nombre, discreto en la fila de la lista. */
export function AssigneeBadge({ nombre, rolEmpresa }: Props): React.ReactElement | null {
  if (!nombre) return null;

  // La fila es estrecha: el rol va en el tooltip, no en el texto ("Juan Pérez · Coordinador").
  const title = nombreConRol(nombre, rolEmpresa);

  return (
    <span className="flex min-w-0 items-center gap-1" title={title}>
      <Avatar className="h-4 w-4 shrink-0">
        <AvatarFallback className="text-[8px] font-medium">{personInitials(nombre)}</AvatarFallback>
      </Avatar>
      <span className="max-w-20 truncate text-[11px] text-muted-foreground">{nombre}</span>
    </span>
  );
}
