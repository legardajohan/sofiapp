import { useEffect, useId, useState } from 'react';
import axios from 'axios';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motivoError, useChangeOwnPassword } from '../hooks/useManageUsers.js';

const MIN_PASSWORD = 8;

interface Props {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
}

/**
 * Cambiar la propia contraseña (AUTH-05). Siempre pide la actual: es la única vía para el usuario
 * principal, y si la olvidó solo el superadministrador puede restablecerla. Al guardar, el backend
 * cierra las demás sesiones y mantiene viva esta.
 */
export function ChangeOwnPasswordDialog({ open, onOpenChange }: Props): React.ReactElement {
  const id = useId();
  const cambiar = useChangeOwnPassword();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [ver, setVer] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [errorActual, setErrorActual] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setActual('');
    setNueva('');
    setConfirmacion('');
    setVer(false);
    setIntentado(false);
    setErrorActual(null);
    setErrorGeneral(null);
  }, [open]);

  const errores = {
    actual: actual.length === 0 ? 'Escribe tu contraseña actual.' : errorActual,
    nueva:
      nueva.length < MIN_PASSWORD
        ? `Usa al menos ${MIN_PASSWORD} caracteres.`
        : nueva === actual
          ? 'La contraseña nueva tiene que ser distinta de la actual.'
          : null,
    confirmacion: confirmacion !== nueva ? 'Las contraseñas no coinciden.' : null,
  };
  const mostrar = (campo: keyof typeof errores): string | null =>
    campo === 'actual' && errorActual ? errorActual : intentado ? errores[campo] : null;

  function enviar(e: React.FormEvent): void {
    e.preventDefault();
    setIntentado(true);
    setErrorGeneral(null);
    // `errorActual` (respuesta del servidor) no bloquea reintentar: se limpia al editar el campo.
    if (actual.length === 0 || errores.nueva || errores.confirmacion) return;
    cambiar.mutate(
      { actual, nueva },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => {
          // 400 = la actual no coincide: el error va junto a su campo, no en un toast.
          if (axios.isAxiosError(error) && error.response?.status === 400) {
            setErrorActual(motivoError(error, 'La contraseña actual no es correcta.'));
            return;
          }
          setErrorGeneral(motivoError(error, 'No se pudo cambiar la contraseña. Inténtalo de nuevo.'));
        },
      },
    );
  }

  const tipo = ver ? 'text' : 'password';
  const pending = cambiar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>Cambiar mi contraseña</DialogTitle>
            <DialogDescription>
              Se cerrarán tus sesiones en otros dispositivos. Aquí seguirás conectado.
            </DialogDescription>
          </DialogHeader>

          <Campo id={`${id}-actual`} label="Contraseña actual" error={mostrar('actual')}>
            <Input
              id={`${id}-actual`}
              type={tipo}
              value={actual}
              onChange={(e) => {
                setActual(e.target.value);
                setErrorActual(null);
              }}
              autoComplete="current-password"
              aria-invalid={mostrar('actual') !== null}
              autoFocus
            />
          </Campo>

          <Campo
            id={`${id}-nueva`}
            label="Contraseña nueva"
            hint={`Mínimo ${MIN_PASSWORD} caracteres.`}
            error={mostrar('nueva')}
          >
            <div className="relative">
              <Input
                id={`${id}-nueva`}
                type={tipo}
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                autoComplete="new-password"
                aria-invalid={mostrar('nueva') !== null}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setVer((v) => !v)}
                aria-label={ver ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
                aria-pressed={ver}
                className="absolute right-0 top-0 h-full text-muted-foreground hover:bg-transparent"
              >
                {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </Campo>

          <Campo id={`${id}-confirmacion`} label="Repite la contraseña nueva" error={mostrar('confirmacion')}>
            <Input
              id={`${id}-confirmacion`}
              type={tipo}
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              autoComplete="new-password"
              aria-invalid={mostrar('confirmacion') !== null}
            />
          </Campo>

          {errorGeneral && (
            <p className="text-sm text-destructive" role="alert">
              {errorGeneral}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
            >
              {pending ? 'Cambiando…' : 'Cambiar contraseña'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  hint?: string;
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
