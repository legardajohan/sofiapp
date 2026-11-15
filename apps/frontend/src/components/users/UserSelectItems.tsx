import { SelectGroup, SelectItem, SelectLabel, SelectSeparator } from '@/components/ui/select';
import { agruparPorRol } from '@/lib/grupos-usuarios';
import type { UserDTO } from '@/features/users/types';

interface Props {
  usuarios: readonly UserDTO[] | undefined;
  /** Sección final «Inactivos» (filtros). Nunca para asignar. */
  incluirInactivos?: boolean;
  /** Ids que no se ofrecen (p. ej. el propio usuario en un selector de «otro»). */
  excluir?: ReadonlySet<string>;
}

/**
 * AUTH-06 — Los usuarios de un `Select`, agrupados por rol: Administradores (el principal primero y
 * marcado) · Coordinadores · Asesores (· Inactivos). Va DENTRO de un `SelectContent`, después de las
 * opciones propias de cada selector («Sin asignar», «Automático»…), para que todos los selectores de
 * personas de la app se lean igual.
 */
export function UserSelectItems({ usuarios, incluirInactivos = false, excluir }: Props): React.ReactElement | null {
  const secciones = agruparPorRol(
    (usuarios ?? []).filter((u) => !excluir?.has(u.id)),
    { incluirInactivos },
  );
  if (secciones.length === 0) return null;
  return (
    <>
      {secciones.map((s, i) => (
        <SelectGroup key={s.clave}>
          {i > 0 && <SelectSeparator />}
          <SelectLabel className="text-xs font-medium text-muted-foreground">{s.etiqueta}</SelectLabel>
          {s.usuarios.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.nombre}
              {u.esPrincipal && <span className="text-muted-foreground"> · principal</span>}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}
