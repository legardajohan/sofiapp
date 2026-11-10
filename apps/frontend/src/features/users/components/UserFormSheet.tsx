import { useEffect, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { SUBROL_LABEL } from '@/lib/roles';
import type { AdminSubrol } from '@/stores/authStore';
import type { CreateUserPayload, UpdateUserPayload, UserDTO } from '../types.js';

/** Qué puede hacer cada subrol, en una frase. Es lo que el gestor necesita para elegir bien. */
const SUBROL_AYUDA: Record<AdminSubrol, string> = {
  director: 'Gestiona usuarios, ve datos sensibles y reportes.',
  manager: 'Ve datos sensibles y reportes del equipo.',
  coordinator: 'Atiende la bandeja y edita contactos.',
  secretary: 'Atiende la bandeja y edita contactos.',
};

const SUBROLES: AdminSubrol[] = ['director', 'manager', 'coordinator', 'secretary'];
const MIN_PASSWORD = 8;

interface Props {
  /** `null` = alta. */
  user: UserDTO | null;
  open: boolean;
  pending: boolean;
  /** El usuario en edición es el propio gestor: no puede cambiarse el subrol. */
  esUnoMismo: boolean;
  onOpenChange: (abierto: boolean) => void;
  onCreate: (payload: CreateUserPayload) => void;
  onUpdate: (payload: UpdateUserPayload) => void;
}

export function UserFormSheet({
  user,
  open,
  pending,
  esUnoMismo,
  onOpenChange,
  onCreate,
  onUpdate,
}: Props): React.ReactElement {
  const id = useId();
  const editando = user !== null;

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [subrol, setSubrol] = useState<AdminSubrol | ''>('');
  const [intentado, setIntentado] = useState(false);

  // Cada apertura parte de los datos del usuario (o vacío): no arrastra lo escrito la vez anterior.
  useEffect(() => {
    if (!open) return;
    setNombre(user?.nombre ?? '');
    setEmail(user?.email ?? '');
    setPassword('');
    setVerPassword(false);
    setSubrol(user?.subrol ?? '');
    setIntentado(false);
  }, [open, user]);

  const errores = {
    nombre: nombre.trim().length < 2 ? 'Escribe el nombre completo.' : null,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'Escribe un email válido.',
    password:
      !editando && password.length < MIN_PASSWORD
        ? `Usa al menos ${MIN_PASSWORD} caracteres.`
        : null,
    // Al editar al propietario (sin subrol) no se le obliga a tener uno: sigue siéndolo.
    subrol: !editando && !subrol ? 'Elige qué puede hacer esta persona.' : null,
  };
  const valido = Object.values(errores).every((e) => e === null);

  function enviar(e: React.FormEvent): void {
    e.preventDefault();
    setIntentado(true);
    if (!valido) return;

    if (!editando) {
      onCreate({
        nombre: nombre.trim(),
        email: email.trim(),
        password,
        subrol: subrol as AdminSubrol,
      });
      return;
    }
    // Solo se envía lo que cambió: el backend audita campo a campo.
    const cambios: UpdateUserPayload = {};
    if (nombre.trim() !== user.nombre) cambios.nombre = nombre.trim();
    if (email.trim().toLowerCase() !== user.email) cambios.email = email.trim();
    if (subrol && subrol !== user.subrol) cambios.subrol = subrol;
    if (Object.keys(cambios).length === 0) {
      onOpenChange(false);
      return;
    }
    onUpdate(cambios);
  }

  const error = (campo: keyof typeof errores): string | null => (intentado ? errores[campo] : null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-6 py-5 text-left">
          <SheetTitle>{editando ? `Editar a ${user.nombre}` : 'Crear usuario'}</SheetTitle>
          <SheetDescription>
            {editando
              ? 'Si cambias el subrol, su sesión se cerrará para que entre con los permisos nuevos.'
              : 'La persona entrará con este email y la contraseña que definas aquí. Compártesela por un canal seguro.'}
          </SheetDescription>
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

            <Campo
              id={`${id}-subrol`}
              label="Subrol"
              hint={
                esUnoMismo
                  ? 'No puedes cambiar tu propio subrol.'
                  : subrol
                    ? SUBROL_AYUDA[subrol]
                    : editando
                      ? 'Propietario de la empresa: acceso total. Asignarle un subrol lo limita.'
                      : undefined
              }
              error={error('subrol')}
            >
              <Select
                value={subrol}
                onValueChange={(v) => setSubrol(v as AdminSubrol)}
                disabled={esUnoMismo}
              >
                <SelectTrigger id={`${id}-subrol`} aria-invalid={error('subrol') !== null}>
                  <SelectValue placeholder={editando ? 'Propietario (sin subrol)' : 'Elige un subrol'} />
                </SelectTrigger>
                <SelectContent>
                  {SUBROLES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SUBROL_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
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
              {pending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear usuario'}
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
