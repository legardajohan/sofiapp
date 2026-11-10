import { useMemo, useState } from 'react';
import { KeyRound, MoreHorizontal, Pencil, Plus, Search, UserCheck, UserX, Users } from 'lucide-react';
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
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { esPropietario, SUBROL_LABEL } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { useAuthStore, type AdminSubrol } from '@/stores/authStore';
import { DeactivateUserDialog } from '../components/DeactivateUserDialog.js';
import { ResetPasswordDialog } from '../components/ResetPasswordDialog.js';
import { UserFormSheet } from '../components/UserFormSheet.js';
import {
  conversacionesAsignadas,
  useCreateUser,
  useManageUsers,
  useResetUserPassword,
  useSetUserEstado,
  useUpdateUser,
} from '../hooks/useManageUsers.js';
import { useTenantUsers } from '../hooks/useTenantUsers.js';
import type {
  ConversacionesAsignadas,
  CreateUserPayload,
  FiltroEstado,
  MoverConversaciones,
  UpdateUserPayload,
  UserDTO,
} from '../types.js';

const TODOS = 'todos';
const SUBROLES: AdminSubrol[] = ['director', 'manager', 'coordinator', 'secretary'];

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

function SubrolCelda({ user }: { user: UserDTO }): React.ReactElement {
  if (esPropietario(user)) {
    return <span className="text-sm font-medium text-foreground">Propietario</span>;
  }
  return <span className="text-sm text-foreground">{user.subrol ? SUBROL_LABEL[user.subrol] : '—'}</span>;
}

export function UsersPage(): React.ReactElement {
  const yo = useAuthStore((s) => s.user);
  const yoSoyPropietario = yo ? esPropietario(yo) : false;

  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('todos');
  const [subrol, setSubrol] = useState<AdminSubrol | typeof TODOS>(TODOS);
  const q = useDebouncedValue(busqueda.trim(), 250);

  const filtros = useMemo(
    () => ({ activo: estado, ...(subrol !== TODOS ? { subrol } : {}), ...(q ? { q } : {}) }),
    [estado, subrol, q],
  );
  const { data: usuarios, isLoading, isFetching } = useManageUsers(filtros);
  const { data: activos } = useTenantUsers();

  const crear = useCreateUser();
  const actualizar = useUpdateUser();
  const cambiarEstado = useSetUserEstado();
  const restablecer = useResetUserPassword();

  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<UserDTO | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<UserDTO | null>(null);
  const [conflicto, setConflicto] = useState<ConversacionesAsignadas | null>(null);
  const [porRestablecer, setPorRestablecer] = useState<UserDTO | null>(null);

  const hayFiltros = estado !== 'todos' || subrol !== TODOS || q !== '';

  /** Un director no toca al propietario; nadie se gestiona a sí mismo desde aquí salvo su nombre. */
  function puedeActuarSobre(u: UserDTO): boolean {
    return !esPropietario(u) || yoSoyPropietario;
  }

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
    if (!editando) return;
    actualizar.mutate({ id: editando.id, payload }, { onSuccess: () => setFormAbierto(false) });
  }

  function pedirDesactivar(u: UserDTO): void {
    setConflicto(null);
    setPorDesactivar(u);
  }

  function cerrarDesactivar(): void {
    setPorDesactivar(null);
    setConflicto(null);
  }

  function desactivar(conversaciones?: MoverConversaciones): void {
    if (!porDesactivar) return;
    cambiarEstado.mutate(
      { id: porDesactivar.id, payload: { activo: false, ...(conversaciones ? { conversaciones } : {}) } },
      {
        onSuccess: cerrarDesactivar,
        onError: (error) => {
          const c = conversacionesAsignadas(error);
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

  const destinos = (activos ?? []).filter((u) => u.id !== porDesactivar?.id);
  const lista = usuarios ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-foreground">Usuarios</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Quién entra al panel de tu empresa y qué puede hacer. Desactivar a alguien cierra su sesión
            en el acto.
          </p>
        </div>
        <Button
          onClick={abrirCrear}
          className="shrink-0 transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Crear usuario
        </Button>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
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
        <div className="flex gap-2">
          <Select value={estado} onValueChange={(v) => setEstado(v as FiltroEstado)}>
            <SelectTrigger aria-label="Filtrar por estado" className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="true">Activos</SelectItem>
              <SelectItem value="false">Inactivos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={subrol} onValueChange={(v) => setSubrol(v as AdminSubrol | typeof TODOS)}>
            <SelectTrigger aria-label="Filtrar por subrol" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los subroles</SelectItem>
              {SUBROLES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SUBROL_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                <p className="text-sm font-medium text-foreground">Todavía no hay usuarios</p>
                <Button variant="outline" onClick={abrirCrear}>
                  <Plus className="h-4 w-4" />
                  Crear usuario
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
                  <TableHead className="hidden sm:table-cell">Subrol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((u) => {
                  const esYo = u.id === yo?.sub;
                  const gestionable = puedeActuarSobre(u);
                  return (
                    <TableRow key={u.id} className={cn(!u.activo && 'text-muted-foreground')}>
                      <TableCell className="max-w-0 sm:max-w-none">
                        <div className="min-w-0">
                          <p className={cn('truncate font-medium', u.activo ? 'text-foreground' : 'text-muted-foreground')}>
                            {u.nombre}
                            {esYo && <span className="ml-2 text-xs font-normal text-muted-foreground">(tú)</span>}
                          </p>
                          <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                          <p className="text-sm text-muted-foreground sm:hidden">
                            {esPropietario(u) ? 'Propietario' : u.subrol ? SUBROL_LABEL[u.subrol] : ''}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <SubrolCelda user={u} />
                      </TableCell>
                      <TableCell>
                        <EstadoBadge activo={u.activo} />
                      </TableCell>
                      <TableCell className="text-right">
                        {gestionable && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Acciones para ${u.nombre}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onSelect={() => abrirEditar(u)}>
                                <Pencil className="h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              {!esYo && (
                                <DropdownMenuItem onSelect={() => setPorRestablecer(u)}>
                                  <KeyRound className="h-4 w-4" />
                                  Restablecer contraseña
                                </DropdownMenuItem>
                              )}
                              {!esYo && <DropdownMenuSeparator />}
                              {!esYo &&
                                (u.activo ? (
                                  <DropdownMenuItem
                                    onSelect={() => pedirDesactivar(u)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <UserX className="h-4 w-4" />
                                    Desactivar
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onSelect={() => reactivar(u)}>
                                    <UserCheck className="h-4 w-4" />
                                    Reactivar
                                  </DropdownMenuItem>
                                ))}
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
        onOpenChange={setFormAbierto}
        onCreate={guardarNuevo}
        onUpdate={guardarCambios}
      />

      <DeactivateUserDialog
        user={porDesactivar}
        conflicto={conflicto}
        destinos={destinos}
        pending={cambiarEstado.isPending}
        onOpenChange={(abierto) => {
          if (!abierto) cerrarDesactivar();
        }}
        onConfirm={desactivar}
      />

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
