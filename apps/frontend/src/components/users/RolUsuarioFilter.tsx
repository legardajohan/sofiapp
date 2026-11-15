import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { miembrosDe, opcionesDeGrupo, type FiltroRolUsuario } from '@/lib/grupos-usuarios';
import type { UserDTO } from '@/features/users/types';

const TODOS = '__todos__';


interface Props {
  idPrefix: string;
  value: FiltroRolUsuario;
  onChange: (v: FiltroRolUsuario) => void;
  usuarios: readonly UserDTO[] | undefined;
  etiquetaRol?: string;
  etiquetaTodos?: string;
  /** Más compacto, para la cabecera de una tarjeta. */
  compacto?: boolean;
}

/**
 * AUTH-06 (ajuste) — Dos filtros encadenados: primero el rol o grupo (con «Todos»), y solo entonces la
 * persona, entre los miembros de ese rol o grupo. Cambiar el rol limpia la persona, para que nunca
 * quede elegido alguien que ya no pertenece al rol. Lo usan los reportes y «Ver asignación».
 */
export function RolUsuarioFilter({
  idPrefix,
  value,
  onChange,
  usuarios,
  etiquetaRol = 'Quiénes',
  etiquetaTodos = 'Todos',
  compacto = false,
}: Props): React.ReactElement {
  const lista = useMemo(() => usuarios ?? [], [usuarios]);
  const { roles, equipos } = useMemo(() => opcionesDeGrupo(lista), [lista]);
  const miembros = useMemo(() => (value.grupo ? miembrosDe(lista, value.grupo) : []), [lista, value.grupo]);
  const alto = compacto ? 'h-8 text-xs' : 'h-9';

  return (
    <div className={cn('flex flex-wrap items-end gap-2', compacto && 'gap-1.5')}>
      <div className="space-y-1.5">
        {!compacto && (
          <Label htmlFor={`${idPrefix}-rol`} className="text-xs text-muted-foreground">
            {etiquetaRol}
          </Label>
        )}
        <Select
          value={value.grupo ?? TODOS}
          onValueChange={(v) => onChange({ grupo: v === TODOS ? undefined : v, persona: undefined })}
        >
          <SelectTrigger
            id={`${idPrefix}-rol`}
            aria-label={compacto ? etiquetaRol : undefined}
            className={cn(alto, compacto ? 'w-44' : 'w-56')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>{etiquetaTodos}</SelectItem>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel className="text-xs font-medium text-muted-foreground">Por rol</SelectLabel>
              {roles.map((o) => (
                <SelectItem key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </SelectItem>
              ))}
            </SelectGroup>
            {equipos.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel className="text-xs font-medium text-muted-foreground">Por coordinador</SelectLabel>
                  {equipos.map((o) => (
                    <SelectItem key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        {!compacto && (
          <Label htmlFor={`${idPrefix}-persona`} className="text-xs text-muted-foreground">
            Persona
          </Label>
        )}
        <Select
          value={value.persona ?? TODOS}
          onValueChange={(v) => onChange({ ...value, persona: v === TODOS ? undefined : v })}
          disabled={!value.grupo}
        >
          <SelectTrigger
            id={`${idPrefix}-persona`}
            aria-label={compacto ? 'Persona' : undefined}
            className={cn(alto, compacto ? 'w-44' : 'w-52')}
            title={!value.grupo ? 'Elige primero un rol o un grupo' : undefined}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>{value.grupo ? 'Todas las personas del grupo' : 'Elige primero un rol'}</SelectItem>
            {miembros.length > 0 && <SelectSeparator />}
            {miembros.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.nombre}
                {u.esPrincipal && <span className="text-muted-foreground"> · principal</span>}
                {!u.activo && <span className="text-muted-foreground"> · inactivo</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
