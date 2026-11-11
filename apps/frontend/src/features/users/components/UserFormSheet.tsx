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
import { ROL_EMPRESA_LABEL, ROLES_EMPRESA } from '@/lib/roles';
import type { RolEmpresa } from '@/stores/authStore';
import type { CreateUserPayload, UpdateUserPayload, UserDTO } from '../types.js';
import { OpcionCard } from './OpcionCard.js';

/** Qué puede hacer cada rol, en una frase. Es lo que el gestor necesita para elegir bien. */
const ROL_AYUDA: Record<RolEmpresa, string> = {
  administrador: 'Acceso total: usuarios, configuración, reportes y datos sensibles.',
  coordinador: 'Gestiona a los asesores de su equipo y atiende la bandeja.',
  asesor: 'Atiende la bandeja y sus clientes. No gestiona ni configura nada.',
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
  /**
   * Quién opera. El coordinador solo da de alta asesores de su equipo y solo edita nombre y email:
   * no ve ni el rol ni el coordinador.
   */
  actor: 'administrador' | 'coordinador';
  /** Coordinadores activos, para asignar el equipo de un asesor (solo administrador). */
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
  actor,
  coordinadores,
  onOpenChange,
  onCreate,
  onUpdate,
}: Props): React.ReactElement {
  const id = useId();
  const editando = user !== null;
  const esAdmin = actor === 'administrador';

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [rol, setRol] = useState<RolEmpresa | ''>('');
  const [coordinadorId, setCoordinadorId] = useState<string>(SIN_COORDINADOR);
  const [intentado, setIntentado] = useState(false);

  // Cada apertura parte de los datos del usuario (o vacío): no arrastra lo escrito la vez anterior.
  useEffect(() => {
    if (!open) return;
    setNombre(user?.nombre ?? '');
    setEmail(user?.email ?? '');
    setPassword('');
    setVerPassword(false);
    setRol(user?.rolEmpresa ?? (esAdmin ? '' : 'asesor'));
    setCoordinadorId(user?.coordinadorId ?? SIN_COORDINADOR);
    setIntentado(false);
  }, [open, user, esAdmin]);

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

  // El coordinador de un asesor solo lo elige el administrador. Si el coordinador guardado ya no
  // está en la lista (inactivo), se muestra como "sin coordinador" y se respeta al no tocarlo.
  const coordinadorElegido = coordinadorId === SIN_COORDINADOR ? null : coordinadorId;
  const pideCoordinador = esAdmin && rol === 'asesor';

  function enviar(e: React.FormEvent): void {
    e.preventDefault();
    setIntentado(true);
    if (!valido || !rol) return;

    if (!editando) {
      onCreate({
        nombre: nombre.trim(),
        email: email.trim(),
        password,
        // El backend fija el rol y el equipo del alta de un coordinador; no se envía nada de eso.
        ...(esAdmin
          ? { rolEmpresa: rol, ...(pideCoordinador && coordinadorElegido ? { coordinadorId: coordinadorElegido } : {}) }
          : { rolEmpresa: 'asesor' as const }),
      });
      return;
    }
    // Solo se envía lo que cambió: el backend audita campo a campo.
    const cambios: UpdateUserPayload = {};
    if (nombre.trim() !== user.nombre) cambios.nombre = nombre.trim();
    if (email.trim().toLowerCase() !== user.email) cambios.email = email.trim();
    if (esAdmin) {
      if (rol !== user.rolEmpresa) cambios.rolEmpresa = rol;
      if (pideCoordinador && coordinadorElegido !== user.coordinadorId) {
        cambios.coordinadorId = coordinadorElegido;
      }
    }
    if (Object.keys(cambios).length === 0) {
      onOpenChange(false);
      return;
    }
    onUpdate(cambios);
  }

  const error = (campo: keyof typeof errores): string | null => (intentado ? errores[campo] : null);

  const descripcion = editando
    ? esAdmin
      ? 'Si cambias el rol, su sesión se cerrará para que entre con los permisos nuevos.'
      : 'Puedes corregir el nombre y el email. El rol y el equipo los cambia un Administrador.'
    : esAdmin
      ? 'La persona entrará con este email y la contraseña que definas aquí. Compártesela por un canal seguro.'
      : 'Será un asesor de tu equipo. Entrará con este email y la contraseña que definas aquí.';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-6 py-5 text-left">
          <SheetTitle>
            {editando ? `Editar a ${user.nombre}` : esAdmin ? 'Crear usuario' : 'Crear asesor'}
          </SheetTitle>
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

            {esAdmin && (
              <fieldset className="space-y-2" disabled={esUnoMismo}>
                <legend className="mb-1.5 text-sm font-medium leading-none text-foreground">Rol</legend>
                <RadioGroup
                  value={rol}
                  onValueChange={(v) => setRol(v as RolEmpresa)}
                  aria-label="Rol en la empresa"
                  aria-invalid={error('rol') !== null}
                  className="gap-2"
                >
                  {ROLES_EMPRESA.map((r) => (
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
                      {r === 'asesor' && rol === 'asesor' && (
                        <div className="mt-3 space-y-1.5">
                          <Label htmlFor={`${id}-coordinador`} className="text-xs text-muted-foreground">
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
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
              {pending
                ? 'Guardando…'
                : editando
                  ? 'Guardar cambios'
                  : esAdmin
                    ? 'Crear usuario'
                    : 'Crear asesor'}
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
