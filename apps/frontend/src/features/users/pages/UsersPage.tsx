import { useMemo, useState } from 'react';
import { Crown, KeyRound, MoreHorizontal, Pencil, Plus, Search, Trash2, UserCheck, UserX, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  esCoordinador,
  puedeConcederPermisoAdmin,
  ROL_EMPRESA_LABEL,
  ROLES_EMPRESA,
  rolesQuePuedeCrear,
} from '@/lib/roles';
import { cn } from '@/lib/utils';
import { useAuthStore, type RolEmpresa } from '@/stores/authStore';
import { ChangeOwnPasswordDialog } from '../components/ChangeOwnPasswordDialog.js';
import { ChangeRoleDialog, type CambioRolPendiente } from '../components/ChangeRoleDialog.js';
import { CupoUsuarios } from '../components/CupoUsuarios.js';
import { DeactivateUserDialog } from '../components/DeactivateUserDialog.js';
import { ResetPasswordDialog } from '../components/ResetPasswordDialog.js';
import { UserFormSheet } from '../components/UserFormSheet.js';
import {
  dependenciasDe,
  useCreateUser,
  useCupoUsuarios,
  useDeleteUser,
  useManageUsers,
  useResetUserPassword,
  useSetUserEstado,
  useUpdateUser,
} from '../hooks/useManageUsers.js';
import { useTenantUsers } from '../hooks/useTenantUsers.js';
import type {
  CreateUserPayload,
  DependenciasUsuario,
  FiltroEstado,
  ManageUsersFilters,
  MoverEquipo,
  SetUserEstadoPayload,
  UpdateUserPayload,
  UserDTO,
} from '../types.js';

const TODOS = 'todos';
const SIN_COORDINADOR = 'ninguno';

function EstadoBadge({ activo }: { activo: boolean }): React.ReactElement {
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 rounded-full', activo ? 'bg-success' : 'bg-muted-foreground/50')}
      />
      {activo ? 'Activo' : 'Inactivo'}
    </Badge>
  );
}

/** El usuario que creó el superadmin con la empresa: nadie del tenant lo gestiona. */
function PrincipalBadge(): React.ReactElement {
  return (
    <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className="shrink-0 gap-1 font-normal">
          <Crown aria-hidden className="h-3 w-3" />
          Principal
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Solo el superadministrador puede restablecer su contraseña.</TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}

function rolDe(u: UserDTO): string {
  return u.rolEmpresa ? ROL_EMPRESA_LABEL[u.rolEmpresa] : '—';
}

/**
 * Usuarios de la empresa (AUTH-03, roles de AUTH-04, jerarquía de AUTH-05). El Administrador ve a
 * todos; el Coordinador, a los asesores de su equipo y a los que no tienen coordinador (lo recorta
 * el backend). Qué se puede hacer en cada fila lo dice `acciones`, que calcula el backend con la
 * misma matriz que aplica: el principal y, para un Administrador sin permiso, los demás
 * Administradores aparecen sin acciones. En la propia fila solo se ofrece cambiar la contraseña.
 */
export function UsersPage(): React.ReactElement {
  const yo = useAuthStore((s) => s.user);
  const soyCoordinador = esCoordinador(yo);
  const rolesPermitidos = rolesQuePuedeCrear(yo);

  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('todos');
  const [rol, setRol] = useState<RolEmpresa | typeof TODOS>(TODOS);
  const [coordinador, setCoordinador] = useState<string>(TODOS);
  const q = useDebouncedValue(busqueda.trim(), 250);

  const filtros = useMemo<ManageUsersFilters>(
    () => ({
      activo: estado,
      ...(rol !== TODOS ? { rolEmpresa: rol } : {}),
      ...(coordinador !== TODOS ? { coordinadorId: coordinador } : {}),
      ...(q ? { q } : {}),
    }),
    [estado, rol, coordinador, q],
  );
  const { data: usuarios, isLoading, isFetching } = useManageUsers(filtros);
  const { data: activos } = useTenantUsers();
  // Todos los coordinadores (también inactivos), para poner nombre a la columna y al filtro.
  const { data: todosLosCoordinadores } = useManageUsers(
    { activo: 'todos', rolEmpresa: 'coordinador' },
    !soyCoordinador,
  );

  const { data: cupo } = useCupoUsuarios();

  const crear = useCreateUser();
  const actualizar = useUpdateUser();
  const cambiarEstado = useSetUserEstado();
  const eliminar = useDeleteUser();
  const restablecer = useResetUserPassword();

  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<UserDTO | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<UserDTO | null>(null);
  const [conflicto, setConflicto] = useState<DependenciasUsuario | null>(null);
  const [cambioRol, setCambioRol] = useState<(CambioRolPendiente & { payload: UpdateUserPayload }) | null>(
    null,
  );
  const [porRestablecer, setPorRestablecer] = useState<UserDTO | null>(null);
  const [porEliminar, setPorEliminar] = useState<UserDTO | null>(null);
  const [conflictoEliminar, setConflictoEliminar] = useState<DependenciasUsuario | null>(null);
  const [cambiandoMiPassword, setCambiandoMiPassword] = useState(false);

  const hayFiltros = estado !== 'todos' || rol !== TODOS || coordinador !== TODOS || q !== '';

  // Nombre de cada coordinador para la columna. El administrador los trae todos (también
  // inactivos) por la gestión; el coordinador, de la lista de usuarios activos del tenant.
  const nombreCoordinador = useMemo(
    () =>
      new Map(
        [...(activos ?? []), ...(todosLosCoordinadores ?? [])]
          .filter((c) => c.rolEmpresa === 'coordinador')
          .map((c) => [c.id, c.nombre]),
      ),
    [activos, todosLosCoordinadores],
  );
  const coordinadoresActivos = (activos ?? []).filter((u) => u.rolEmpresa === 'coordinador');

  function abrirCrear(): void {
    setEditando(null);
    setFormAbierto(true);
  }

  function abrirEditar(u: UserDTO): void {
    setEditando(u);
    setFormAbierto(true);
  }

  function guardarNuevo(payload: CreateUserPayload): void {
    crear.mutate(payload, { onSuccess: () => setFormAbierto(false) });
  }

  function guardarCambios(payload: UpdateUserPayload): void {
    const objetivo = editando;
    if (!objetivo) return;
    actualizar.mutate(
      { id: objetivo.id, payload },
      {
        onSuccess: () => setFormAbierto(false),
        onError: (error) => {
          // Un coordinador con equipo que cambia de rol: el diálogo pregunta a dónde va su equipo.
          const c = dependenciasDe(error);
          if (c && payload.rolEmpresa) {
            setCambioRol({ user: objetivo, rolEmpresa: payload.rolEmpresa, asesores: c.asesores, payload });
          }
        },
      },
    );
  }

  function confirmarCambioRol(equipo: MoverEquipo): void {
    if (!cambioRol) return;
    actualizar.mutate(
      { id: cambioRol.user.id, payload: { ...cambioRol.payload, equipo } },
      {
        onSuccess: () => {
          setCambioRol(null);
          setFormAbierto(false);
        },
      },
    );
  }

  function pedirDesactivar(u: UserDTO): void {
    setConflicto(null);
    setPorDesactivar(u);
  }

  function cerrarDesactivar(): void {
    setPorDesactivar(null);
    setConflicto(null);
  }

  function desactivar(resolucion: Omit<SetUserEstadoPayload, 'activo'>): void {
    if (!porDesactivar) return;
    cambiarEstado.mutate(
      { id: porDesactivar.id, payload: { activo: false, ...resolucion } },
      {
        onSuccess: cerrarDesactivar,
        onError: (error) => {
          const c = dependenciasDe(error);
          if (c) setConflicto(c);
        },
      },
    );
  }

  function reactivar(u: UserDTO): void {
    cambiarEstado.mutate({ id: u.id, payload: { activo: true } });
  }

  function confirmarRestablecer(password: string): void {
    if (!porRestablecer) return;
    restablecer.mutate(
      { id: porRestablecer.id, password },
      { onSuccess: () => setPorRestablecer(null) },
    );
  }

  function pedirEliminar(u: UserDTO): void {
    setConflictoEliminar(null);
    setPorEliminar(u);
  }

  function cerrarEliminar(): void {
    setPorEliminar(null);
    setConflictoEliminar(null);
  }

  function confirmarEliminar(resolucion: Omit<SetUserEstadoPayload, 'activo'>): void {
    if (!porEliminar) return;
    eliminar.mutate(
      { id: porEliminar.id, payload: resolucion },
      {
        onSuccess: cerrarEliminar,
        onError: (error) => {
          const c = dependenciasDe(error);
          if (c) setConflictoEliminar(c);
        },
      },
    );
  }

  // A quién pueden ir las conversaciones de quien se retira: cualquier usuario activo (AUTH-05).
  const destinosPara = (objetivo: UserDTO | null): UserDTO[] =>
    (activos ?? []).filter((u) => u.id !== objetivo?.id);
  const lista = usuarios ?? [];
  const etiquetaCrear = rolesPermitidos.length > 1 ? 'Crear usuario' : 'Crear asesor';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-foreground">{soyCoordinador ? 'Mi equipo' : 'Usuarios'}</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {soyCoordinador
              ? 'Los asesores de tu equipo y los que aún no tienen coordinador. Desactivar a alguien cierra su sesión en el acto.'
              : 'Quién entra al panel de tu empresa y qué puede hacer. Desactivar a alguien cierra su sesión en el acto.'}
          </p>
        </div>
        <Button
          onClick={abrirCrear}
          className="shrink-0 transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          {etiquetaCrear}
        </Button>
      </header>

      <CupoUsuarios cupo={cupo} />

      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o email"
            aria-label="Buscar usuarios"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex">
          <Select value={estado} onValueChange={(v) => setEstado(v as FiltroEstado)}>
            <SelectTrigger aria-label="Filtrar por estado" className="w-full lg:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="true">Activos</SelectItem>
              <SelectItem value="false">Inactivos</SelectItem>
            </SelectContent>
          </Select>
          {soyCoordinador && (
            <Select value={coordinador} onValueChange={setCoordinador}>
              <SelectTrigger aria-label="Filtrar por equipo" className="w-full lg:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Mi equipo y sin coordinador</SelectItem>
                {yo && <SelectItem value={yo.sub}>Solo mi equipo</SelectItem>}
                <SelectItem value={SIN_COORDINADOR}>Solo sin coordinador</SelectItem>
              </SelectContent>
            </Select>
          )}
          {!soyCoordinador && (
            <>
              <Select value={rol} onValueChange={(v) => setRol(v as RolEmpresa | typeof TODOS)}>
                <SelectTrigger aria-label="Filtrar por rol" className="w-full lg:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos los roles</SelectItem>
                  {ROLES_EMPRESA.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROL_EMPRESA_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={coordinador} onValueChange={setCoordinador}>
                <SelectTrigger aria-label="Filtrar por coordinador" className="w-full lg:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Cualquier coordinador</SelectItem>
                  <SelectItem value={SIN_COORDINADOR}>Sin coordinador</SelectItem>
                  {(todosLosCoordinadores ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      Equipo de {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </div>

      <div
        className={cn(
          'overflow-hidden rounded-xl border border-border bg-card transition-opacity duration-150',
          isFetching && !isLoading && 'opacity-70',
        )}
      >
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            {hayFiltros ? (
              <div>
                <p className="text-sm font-medium text-foreground">Nadie coincide con esos filtros</p>
                <p className="mt-1 text-sm text-muted-foreground">Prueba con otro nombre o quita un filtro.</p>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {soyCoordinador ? 'Todavía no hay asesores a tu cargo' : 'Todavía no hay usuarios'}
                  </p>
                  {soyCoordinador && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Crea uno o pide a un Administrador que te asigne asesores. Aquí también verás a los
                      asesores sin coordinador.
                    </p>
                  )}
                </div>
                <Button variant="outline" onClick={abrirCrear}>
                  <Plus className="h-4 w-4" />
                  {etiquetaCrear}
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  {!soyCoordinador && <TableHead className="hidden sm:table-cell">Rol</TableHead>}
                  <TableHead className="hidden md:table-cell">Coordinador</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((u) => {
                  const esYo = u.id === yo?.sub;
                  const coord = u.coordinadorId ? nombreCoordinador.get(u.coordinadorId) : undefined;
                  const acciones = u.acciones ?? { editar: false, contrasena: false, estado: false, eliminar: false };
                  const hayAcciones = esYo || Object.values(acciones).some(Boolean);
                  return (
                    <TableRow key={u.id} className={cn(!u.activo && 'text-muted-foreground')}>
                      <TableCell className="max-w-0 sm:max-w-none">
                        <div className="min-w-0">
                          <p
                            className={cn(
                              'flex min-w-0 items-center gap-2 font-medium',
                              u.activo ? 'text-foreground' : 'text-muted-foreground',
                            )}
                          >
                            <span className="truncate">{u.nombre}</span>
                            {esYo && <span className="shrink-0 text-xs font-normal text-muted-foreground">(tú)</span>}
                            {u.esPrincipal && <PrincipalBadge />}
                          </p>
                          <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                          {!soyCoordinador && (
                            <p className="text-sm text-muted-foreground sm:hidden">{rolDe(u)}</p>
                          )}
                        </div>
                      </TableCell>
                      {!soyCoordinador && (
                        <TableCell className="hidden text-sm text-foreground sm:table-cell">{rolDe(u)}</TableCell>
                      )}
                      <TableCell className="hidden text-sm md:table-cell">
                        {u.rolEmpresa !== 'asesor' ? (
                          <span className="text-muted-foreground">—</span>
                        ) : coord ? (
                          <span className="text-foreground">{u.coordinadorId === yo?.sub ? 'Tú' : coord}</span>
                        ) : (
                          <span className="text-muted-foreground">Sin coordinador</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <EstadoBadge activo={u.activo} />
                      </TableCell>
                      <TableCell className="text-right">
                        {hayAcciones && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Acciones para ${u.nombre}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              {esYo ? (
                                <DropdownMenuItem onSelect={() => setCambiandoMiPassword(true)}>
                                  <KeyRound className="h-4 w-4" />
                                  Cambiar mi contraseña
                                </DropdownMenuItem>
                              ) : (
                                <>
                                  {acciones.editar && (
                                    <DropdownMenuItem onSelect={() => abrirEditar(u)}>
                                      <Pencil className="h-4 w-4" />
                                      Editar
                                    </DropdownMenuItem>
                                  )}
                                  {acciones.contrasena && (
                                    <DropdownMenuItem onSelect={() => setPorRestablecer(u)}>
                                      <KeyRound className="h-4 w-4" />
                                      Restablecer contraseña
                                    </DropdownMenuItem>
                                  )}
                                  {acciones.estado && !u.activo && (
                                    <DropdownMenuItem onSelect={() => reactivar(u)}>
                                      <UserCheck className="h-4 w-4" />
                                      Reactivar
                                    </DropdownMenuItem>
                                  )}
                                  {(acciones.estado || acciones.eliminar) && <DropdownMenuSeparator />}
                                  {acciones.estado && u.activo && (
                                    <DropdownMenuItem
                                      onSelect={() => pedirDesactivar(u)}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <UserX className="h-4 w-4" />
                                      Desactivar
                                    </DropdownMenuItem>
                                  )}
                                  {acciones.eliminar && (
                                    <DropdownMenuItem
                                      onSelect={() => pedirEliminar(u)}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Eliminar
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <UserFormSheet
        user={editando}
        open={formAbierto}
        pending={crear.isPending || actualizar.isPending}
        esUnoMismo={editando !== null && editando.id === yo?.sub}
        rolesPermitidos={rolesPermitidos}
        puedeConcederPermiso={puedeConcederPermisoAdmin(yo)}
        coordinadorPorDefecto={soyCoordinador ? (yo?.sub ?? null) : null}
        coordinadores={coordinadoresActivos}
        onOpenChange={setFormAbierto}
        onCreate={guardarNuevo}
        onUpdate={guardarCambios}
      />

      <ChangeRoleDialog
        cambio={cambioRol}
        coordinadores={coordinadoresActivos.filter((c) => c.id !== cambioRol?.user.id)}
        pending={actualizar.isPending}
        onOpenChange={(abierto) => {
          if (!abierto) setCambioRol(null);
        }}
        onConfirm={confirmarCambioRol}
      />

      <DeactivateUserDialog
        user={porDesactivar}
        conflicto={conflicto}
        destinos={destinosPara(porDesactivar)}
        coordinadores={coordinadoresActivos.filter((c) => c.id !== porDesactivar?.id)}
        pending={cambiarEstado.isPending}
        onOpenChange={(abierto) => {
          if (!abierto) cerrarDesactivar();
        }}
        onConfirm={desactivar}
      />

      <DeactivateUserDialog
        modo="eliminar"
        user={porEliminar}
        conflicto={conflictoEliminar}
        destinos={destinosPara(porEliminar)}
        coordinadores={coordinadoresActivos.filter((c) => c.id !== porEliminar?.id)}
        pending={eliminar.isPending}
        onOpenChange={(abierto) => {
          if (!abierto) cerrarEliminar();
        }}
        onConfirm={confirmarEliminar}
      />

      <ChangeOwnPasswordDialog open={cambiandoMiPassword} onOpenChange={setCambiandoMiPassword} />

      <ResetPasswordDialog
        user={porRestablecer}
        pending={restablecer.isPending}
        onOpenChange={(abierto) => {
          if (!abierto) setPorRestablecer(null);
        }}
        onConfirm={confirmarRestablecer}
      />
    </div>
  );
}
