import { useEffect, useMemo, useState } from 'react';
import {
  RESERVA_POR_DEFECTO,
  VENTANA_VENTAS_DIAS,
  etiquetaGrupo,
  parsearGrupoQuery,
  perteneceAlGrupo,
  serializarGrupoQuery,
  type CriterioDestino,
  type DestinoAsignacion,
  type GrupoUsuarios,
  type ReservaDestino,
} from '@sofiapp/shared';
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
import { Switch } from '@/components/ui/switch';
import type { UserDTO } from '@/features/users/types';
import { describirDestino, opcionesDeGrupo, type OpcionGrupo } from '@/lib/grupos-usuarios';

/**
 * AUTH-06 — Editor de «a quién va la conversación». Lo usan la transferencia del Asistente IA y los
 * nodos `handoff` / `asignar_asesor` de los flujos: mismo componente y misma regla en el backend
 * (`resolverDestinoAsignacion`).
 *
 * Dos pasos (ajuste de AUTH-06):
 *  1. **Quién recibe la conversación** — un rol, o el grupo de un coordinador (él y sus asesores).
 *  2. **Dentro del grupo, se elige a** — un reparto automático (menos conversaciones activas, más
 *     ventas cerradas) o una persona concreta de ese grupo.
 * Debajo, «solo en línea» (para los repartos automáticos) y qué pasa «si no hay nadie disponible».
 */

interface Props {
  idPrefix: string;
  /** `null` solo si `opcionGeneral` está presente: el nodo usa la configuración de transferencia. */
  value: DestinoAsignacion | null;
  onChange: (destino: DestinoAsignacion | null) => void;
  /** Usuarios del tenant (`undefined` mientras cargan). Solo se ofrecen los activos. */
  usuarios: readonly UserDTO[] | undefined;
  /** Texto de la opción «sin destino propio» (nodo `handoff`). Sin él, siempre hay destino. */
  opcionGeneral?: string;
  etiqueta?: string;
}

const GENERAL = '__general__';
const TODOS: GrupoUsuarios = { tipo: 'todos' };
const VALOR_TODOS = serializarGrupoQuery(TODOS);
const PREFIJO_CRITERIO = 'criterio:';

const CRITERIO_LABEL: Record<CriterioDestino, string> = {
  menor_carga: 'Quien tenga menos conversaciones activas',
  mas_ventas: 'Quien tenga más ventas cerradas',
  primero: 'El primero por orden alfabético (configuración anterior)',
};

/** Los criterios que se ofrecen; `primero` solo aparece si ya estaba guardado. */
const CRITERIOS_OFRECIDOS: readonly CriterioDestino[] = ['menor_carga', 'mas_ventas'];

/** El grupo «de contexto» de un usuario fijo, para mostrar en el paso 1 de dónde se eligió. */
function grupoDeUsuario(u: UserDTO | undefined): GrupoUsuarios {
  return u?.rolEmpresa ? { tipo: 'rol', rol: u.rolEmpresa } : TODOS;
}

function miembrosActivos(usuarios: readonly UserDTO[], g: GrupoUsuarios): UserDTO[] {
  return usuarios
    .filter((u) => u.activo && perteneceAlGrupo({ ...u, rolEmpresa: u.rolEmpresa ?? null }, g))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function OpcionesDeGrupo({ roles, equipos }: { roles: OpcionGrupo[]; equipos: OpcionGrupo[] }): React.ReactElement {
  return (
    <>
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
    </>
  );
}

export function DestinoSelector({
  idPrefix,
  value,
  onChange,
  usuarios,
  opcionGeneral,
  etiqueta = 'Quién recibe la conversación',
}: Props): React.ReactElement {
  const lista = useMemo(() => usuarios ?? [], [usuarios]);
  const activos = useMemo(() => lista.filter((u) => u.activo), [lista]);
  const { roles, equipos } = useMemo(() => opcionesDeGrupo(lista), [lista]);
  const nombres = useMemo(() => new Map(lista.map((u) => [u.id, u.nombre])), [lista]);

  // Con un usuario fijo, el paso 1 recuerda en qué grupo se eligió (no viaja al backend).
  const usuarioFijo = value?.modo === 'usuario' ? lista.find((u) => u.id === value.usuarioId) : undefined;
  const [grupoContexto, setGrupoContexto] = useState<GrupoUsuarios>(
    value?.modo === 'grupo' ? value.grupo : grupoDeUsuario(usuarioFijo),
  );
  useEffect(() => {
    if (value?.modo === 'grupo') setGrupoContexto(value.grupo);
  }, [value]);
  // Si los usuarios aún no habían cargado al montar, el usuario fijo se ubica en su rol al llegar.
  const contexto =
    value?.modo === 'usuario' && grupoContexto.tipo === 'todos' && usuarioFijo ? grupoDeUsuario(usuarioFijo) : grupoContexto;
  const grupoActual = value?.modo === 'grupo' ? value.grupo : contexto;
  const valorGrupo = value === null ? GENERAL : serializarGrupoQuery(grupoActual);
  // Un grupo de coordinador guardado sin él (antes de este ajuste) no está en la lista: se añade.
  const grupoHuerfano =
    value !== null && ![VALOR_TODOS, ...roles.map((r) => r.valor), ...equipos.map((e) => e.valor)].includes(valorGrupo);
  const miembros = useMemo(() => miembrosActivos(activos, grupoActual), [activos, grupoActual]);

  const valorEleccion =
    value === null ? undefined : value.modo === 'grupo' ? `${PREFIJO_CRITERIO}${value.criterio}` : value.usuarioId;
  // Un usuario elegido que ya no está activo se sigue mostrando, para no borrar la elección en silencio.
  const usuarioHuerfano =
    value?.modo === 'usuario' && usuarios !== undefined && !miembros.some((u) => u.id === value.usuarioId);

  function elegirGrupo(v: string): void {
    if (v === GENERAL) return onChange(null);
    const grupo = parsearGrupoQuery(v);
    if (!grupo || grupo.tipo === 'usuario') return;
    setGrupoContexto(grupo);
    const reserva = value?.reserva ?? RESERVA_POR_DEFECTO;
    // Si la persona fija sigue en el nuevo grupo, se conserva; si no, el grupo pasa a reparto automático.
    if (value?.modo === 'usuario' && miembrosActivos(activos, grupo).some((u) => u.id === value.usuarioId)) return;
    onChange({
      modo: 'grupo',
      grupo,
      criterio: value?.modo === 'grupo' ? value.criterio : 'menor_carga',
      soloEnLinea: value?.modo === 'grupo' ? value.soloEnLinea : false,
      reserva,
    });
  }

  function elegirDentro(v: string): void {
    const reserva = value?.reserva ?? RESERVA_POR_DEFECTO;
    if (v.startsWith(PREFIJO_CRITERIO)) {
      onChange({
        modo: 'grupo',
        grupo: grupoActual,
        criterio: v.slice(PREFIJO_CRITERIO.length) as CriterioDestino,
        soloEnLinea: value?.modo === 'grupo' ? value.soloEnLinea : false,
        reserva,
      });
      return;
    }
    onChange({ modo: 'usuario', usuarioId: v, reserva });
  }

  function cambiarReserva(v: string): void {
    if (!value) return;
    let reserva: ReservaDestino;
    if (v === 'cualquiera' || v === 'sin_asignar') reserva = { tipo: v };
    else {
      const grupo = parsearGrupoQuery(v);
      if (!grupo || grupo.tipo === 'usuario') return;
      reserva = { tipo: 'grupo', grupo };
    }
    onChange({ ...value, reserva });
  }

  const valorReserva = !value
    ? undefined
    : value.reserva.tipo === 'grupo'
      ? serializarGrupoQuery(value.reserva.grupo)
      : value.reserva.tipo;
  const criteriosVisibles: CriterioDestino[] =
    value?.modo === 'grupo' && !CRITERIOS_OFRECIDOS.includes(value.criterio)
      ? [...CRITERIOS_OFRECIDOS, value.criterio]
      : [...CRITERIOS_OFRECIDOS];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-destino`}>{etiqueta}</Label>
        <Select value={valorGrupo} onValueChange={elegirGrupo}>
          <SelectTrigger id={`${idPrefix}-destino`} className="w-full bg-background">
            <SelectValue placeholder="Elige un rol o un grupo" />
          </SelectTrigger>
          <SelectContent>
            {opcionGeneral && (
              <>
                <SelectItem value={GENERAL}>{opcionGeneral}</SelectItem>
                <SelectSeparator />
              </>
            )}
            <SelectItem value={VALOR_TODOS}>Todos</SelectItem>
            <SelectSeparator />
            <OpcionesDeGrupo roles={roles} equipos={equipos} />
            {grupoHuerfano && (
              <SelectItem value={valorGrupo}>{etiquetaGrupo(grupoActual, nombres)}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {value && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-eleccion`}>Dentro del grupo, se elige a</Label>
          <Select value={valorEleccion} onValueChange={elegirDentro}>
            <SelectTrigger id={`${idPrefix}-eleccion`} className="w-full bg-background">
              <SelectValue placeholder="Elige cómo o a quién" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel className="text-xs font-medium text-muted-foreground">Reparto automático</SelectLabel>
                {criteriosVisibles.map((c) => (
                  <SelectItem key={c} value={`${PREFIJO_CRITERIO}${c}`}>
                    {CRITERIO_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectGroup>
              {(miembros.length > 0 || usuarioHuerfano) && <SelectSeparator />}
              <SelectGroup>
                {miembros.length > 0 && (
                  <SelectLabel className="text-xs font-medium text-muted-foreground">Siempre a</SelectLabel>
                )}
                {miembros.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nombre}
                    {u.esPrincipal && <span className="text-muted-foreground"> · principal</span>}
                  </SelectItem>
                ))}
                {usuarioHuerfano && value?.modo === 'usuario' && (
                  <SelectItem value={value.usuarioId}>
                    {nombres.get(value.usuarioId) ?? 'Usuario'} <span className="text-muted-foreground">(inactivo)</span>
                  </SelectItem>
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
          {value.modo === 'grupo' && value.criterio === 'mas_ventas' && (
            <p className="text-xs text-muted-foreground">
              Cuenta las ventas cerradas de los últimos {VENTANA_VENTAS_DIAS} días. Ante un empate, la
              recibe el primero por nombre.
            </p>
          )}
          {usuarioHuerfano && (
            <p className="text-xs text-destructive">
              Esta persona ya no está activa. Mientras no elijas otra, se aplica lo que digas abajo.
            </p>
          )}
        </div>
      )}

      {value?.modo === 'grupo' && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor={`${idPrefix}-en-linea`} className="text-sm font-normal">
              Solo quienes están en línea
            </Label>
            <p className="text-xs text-muted-foreground">Con actividad en SofiApp en los últimos 5 minutos.</p>
          </div>
          <Switch
            id={`${idPrefix}-en-linea`}
            checked={value.soloEnLinea}
            onCheckedChange={(soloEnLinea) => onChange({ ...value, soloEnLinea })}
          />
        </div>
      )}

      {value && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-reserva`}>Si no hay nadie disponible</Label>
          <Select value={valorReserva} onValueChange={cambiarReserva}>
            <SelectTrigger id={`${idPrefix}-reserva`} className="w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cualquiera">Pasarla a cualquier usuario activo</SelectItem>
              <SelectItem value="sin_asignar">Dejarla sin asignar</SelectItem>
              <SelectSeparator />
              <OpcionesDeGrupo
                roles={roles.map((r) => ({ ...r, etiqueta: `Pasarla a: ${r.etiqueta.toLowerCase()}` }))}
                equipos={equipos.map((e) => ({ ...e, etiqueta: `Pasarla al ${e.etiqueta.charAt(0).toLowerCase()}${e.etiqueta.slice(1)}` }))}
              />
              {value.reserva.tipo === 'grupo' &&
                valorReserva !== undefined &&
                ![...roles, ...equipos].some((o) => o.valor === valorReserva) && (
                  <SelectItem value={valorReserva}>{etiquetaGrupo(value.reserva.grupo, nombres)}</SelectItem>
                )}
            </SelectContent>
          </Select>
        </div>
      )}

      {value && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {describirDestino(value, nombres)}
        </p>
      )}
    </div>
  );
}

