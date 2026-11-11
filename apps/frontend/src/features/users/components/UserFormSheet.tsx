import { useEffect, useId, useState } from 'react';
import { Eye, EyeOff, Headset, ShieldCheck, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { ROL_EMPRESA_LABEL } from '@/lib/roles';
import type { RolEmpresa } from '@/stores/authStore';
import type { CreateUserPayload, UpdateUserPayload, UserDTO } from '../types.js';
import { OpcionCard } from './OpcionCard.js';

/**
 * Qué cambia entre roles, en una frase. Desde AUTH-05 los tres usan el producto igual: la única
 * diferencia es a quién pueden gestionar en Usuarios.
 */
const ROL_AYUDA: Record<RolEmpresa, string> = {
  administrador: 'Crea y gestiona coordinadores y asesores.',
  coordinador: 'Crea asesores y gestiona los de su equipo y los que no tienen coordinador.',
  asesor: 'Usa todo el panel, pero no entra a Usuarios.',
};

const ROL_ICONO: Record<RolEmpresa, React.ReactNode> = {
  administrador: <ShieldCheck className="h-4 w-4" />,
  coordinador: <UsersRound className="h-4 w-4" />,
  asesor: <Headset className="h-4 w-4" />,
};

const SIN_COORDINADOR = '__ninguno';
const MIN_PASSWORD = 8;

interface Props {
  /** `null` = alta. */
  user: UserDTO | null;
  open: boolean;
  pending: boolean;
  /** El usuario en edición es el propio gestor: no puede cambiarse el rol. */
  esUnoMismo: boolean;
  /** Roles que quien opera puede crear o asignar (`rolesQuePuedeCrear`, gemelo del backend). */
  rolesPermitidos: readonly RolEmpresa[];
  /** Solo el usuario principal concede el permiso de gestionar administradores. */
  puedeConcederPermiso: boolean;
  /** Coordinador preseleccionado al crear un asesor (el propio coordinador, si es quien crea). */
  coordinadorPorDefecto: string | null;
  /** Coordinadores activos, para asignar el equipo de un asesor. */
  coordinadores: UserDTO[];
  onOpenChange: (abierto: boolean) => void;
  onCreate: (payload: CreateUserPayload) => void;
  onUpdate: (payload: UpdateUserPayload) => void;
}

export function UserFormSheet({
  user,
  open,
  pending,
  esUnoMismo,
  rolesPermitidos,
  puedeConcederPermiso,
  coordinadorPorDefecto,
  coordinadores,
  onOpenChange,
  onCreate,
  onUpdate,
}: Props): React.ReactElement {
  const id = useId();
  const editando = user !== null;
  // Con un solo rol posible (el coordinador solo crea asesores) no hay nada que elegir.
  const eligeRol = rolesPermitidos.length > 1;
  const rolUnico = rolesPermitidos.length === 1 ? rolesPermitidos[0] : undefined;

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [rol, setRol] = useState<RolEmpresa | ''>('');
  const [coordinadorId, setCoordinadorId] = useState<string>(SIN_COORDINADOR);
  const [permisoAdmin, setPermisoAdmin] = useState(false);
  const [intentado, setIntentado] = useState(false);

  // Cada apertura parte de los datos del usuario (o vacío): no arrastra lo escrito la vez anterior.
  useEffect(() => {
    if (!open) return;
    setNombre(user?.nombre ?? '');
    setEmail(user?.email ?? '');
    setPassword('');
    setVerPassword(false);
    setRol(user?.rolEmpresa ?? rolUnico ?? '');
    setCoordinadorId(
      user ? (user.coordinadorId ?? SIN_COORDINADOR) : (coordinadorPorDefecto ?? SIN_COORDINADOR),
    );
    setPermisoAdmin(user?.puedeGestionarAdministradores ?? false);
    setIntentado(false);
  }, [open, user, rolUnico, coordinadorPorDefecto]);

  const errores = {
    nombre: nombre.trim().length < 2 ? 'Escribe el nombre completo.' : null,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'Escribe un email válido.',
    password:
      !editando && password.length < MIN_PASSWORD
        ? `Usa al menos ${MIN_PASSWORD} caracteres.`
        : null,
    rol: !rol ? 'Elige qué puede hacer esta persona.' : null,
  };
  const valido = Object.values(errores).every((e) => e === null);

  // Si el coordinador guardado ya no está en la lista (inactivo), se muestra como "sin coordinador"
  // y se respeta al no tocarlo.
  const coordinadorElegido = coordinadorId === SIN_COORDINADOR ? null : coordinadorId;
  const pideCoordinador = rol === 'asesor';
  const pidePermiso = puedeConcederPermiso && rol === 'administrador';

  function enviar(e: React.FormEvent): void {
    e.preventDefault();
    setIntentado(true);
    if (!valido || !rol) return;

    if (!editando) {
      onCreate({
        nombre: nombre.trim(),
        email: email.trim(),
        password,
        rolEmpresa: rol,
        ...(pideCoordinador ? { coordinadorId: coordinadorElegido } : {}),
        ...(pidePermiso && permisoAdmin ? { puedeGestionarAdministradores: true } : {}),
      });
      return;
    }
    // Solo se envía lo que cambió: el backend audita campo a campo.
    const cambios: UpdateUserPayload = {};
    if (nombre.trim() !== user.nombre) cambios.nombre = nombre.trim();
    if (email.trim().toLowerCase() !== user.email) cambios.email = email.trim();
    if (eligeRol && rol !== user.rolEmpresa) cambios.rolEmpresa = rol;
    if (pideCoordinador && coordinadorElegido !== user.coordinadorId) {
      cambios.coordinadorId = coordinadorElegido;
    }
    if (pidePermiso && permisoAdmin !== user.puedeGestionarAdministradores) {
      cambios.puedeGestionarAdministradores = permisoAdmin;
    }
    if (Object.keys(cambios).length === 0) {
      onOpenChange(false);
      return;
    }
    onUpdate(cambios);
  }

  const error = (campo: keyof typeof errores): string | null => (intentado ? errores[campo] : null);

  const titulo = editando ? `Editar a ${user.nombre}` : eligeRol ? 'Crear usuario' : 'Crear asesor';
  const descripcion = editando
    ? eligeRol
      ? 'Si cambias el rol, su sesión se cerrará para que entre con los permisos nuevos.'
      : 'Puedes corregir el nombre y el email, y moverlo a otro coordinador.'
    : 'La persona entrará con este email y la contraseña que definas aquí. Compártesela por un canal seguro.';

  const selectorCoordinador = (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-coordinador`} className={eligeRol ? 'text-xs text-muted-foreground' : undefined}>
        Coordinador
      </Label>
      <Select value={coordinadorId} onValueChange={setCoordinadorId}>
        <SelectTrigger id={`${id}-coordinador`} className="bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SIN_COORDINADOR}>Sin coordinador</SelectItem>
          {coordinadores.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.nombre}
              {c.id === coordinadorPorDefecto && <span className="text-muted-foreground"> (tú)</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!eligeRol && (
        <p className="text-sm text-muted-foreground">
          Si lo asignas a otro coordinador, dejarás de verlo en tu lista.
        </p>
      )}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-6 py-5 text-left">
          <SheetTitle>{titulo}</SheetTitle>
          <SheetDescription>{descripcion}</SheetDescription>
        </SheetHeader>

        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <Campo id={`${id}-nombre`} label="Nombre" error={error('nombre')}>
              <Input
                id={`${id}-nombre`}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoComplete="off"
                aria-invalid={error('nombre') !== null}
                autoFocus
              />
            </Campo>

            <Campo id={`${id}-email`} label="Email" error={error('email')}>
              <Input
                id={`${id}-email`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                aria-invalid={error('email') !== null}
              />
            </Campo>

            {!editando && (
              <Campo
                id={`${id}-password`}
                label="Contraseña inicial"
                hint={`Mínimo ${MIN_PASSWORD} caracteres.`}
                error={error('password')}
              >
                <div className="relative">
                  <Input
                    id={`${id}-password`}
                    type={verPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    aria-invalid={error('password') !== null}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setVerPassword((v) => !v)}
                    aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-0 top-0 h-full text-muted-foreground hover:bg-transparent"
                  >
                    {verPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </Campo>
            )}

            {eligeRol ? (
              <fieldset className="space-y-2" disabled={esUnoMismo}>
                <legend className="mb-1.5 text-sm font-medium leading-none text-foreground">Rol</legend>
                <RadioGroup
                  value={rol}
                  onValueChange={(v) => setRol(v as RolEmpresa)}
                  aria-label="Rol en la empresa"
                  aria-invalid={error('rol') !== null}
                  className="gap-2"
                >
                  {rolesPermitidos.map((r) => (
                    <OpcionCard
                      key={r}
                      id={`${id}-rol-${r}`}
                      valor={r}
                      activa={rol === r}
                      deshabilitada={esUnoMismo}
                      icono={ROL_ICONO[r]}
                      titulo={ROL_EMPRESA_LABEL[r]}
                      detalle={ROL_AYUDA[r]}
                    >
                      {r === 'asesor' && rol === 'asesor' && <div className="mt-3">{selectorCoordinador}</div>}
                      {r === 'administrador' && pidePermiso && (
                        <div className="mt-3 flex items-start justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5">
                          <div className="space-y-0.5">
                            <Label htmlFor={`${id}-permiso`} className="text-sm font-medium">
                              Puede gestionar a otros administradores
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Crear, editar, desactivar y eliminar administradores. Nunca a ti.
                            </p>
                          </div>
                          <Switch
                            id={`${id}-permiso`}
                            checked={permisoAdmin}
                            onCheckedChange={setPermisoAdmin}
                          />
                        </div>
                      )}
                    </OpcionCard>
                  ))}
                </RadioGroup>
                {esUnoMismo ? (
                  <p className="text-sm text-muted-foreground">No puedes cambiar tu propio rol.</p>
                ) : error('rol') ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error('rol')}
                  </p>
                ) : null}
              </fieldset>
            ) : (
              pideCoordinador && selectorCoordinador
            )}
          </div>

          <SheetFooter className="border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
            >
              {pending ? 'Guardando…' : editando ? 'Guardar cambios' : titulo}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Campo({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  error: string | null;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
