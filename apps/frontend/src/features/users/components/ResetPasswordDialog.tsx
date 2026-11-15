import { useEffect, useId, useState } from 'react';
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
import type { UserDTO } from '../types.js';

const MIN_PASSWORD = 8;

interface Props {
  user: UserDTO | null;
  pending: boolean;
  onOpenChange: (abierto: boolean) => void;
  onConfirm: (password: string) => void;
}

export function ResetPasswordDialog({ user, pending, onOpenChange, onConfirm }: Props): React.ReactElement {
  const id = useId();
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);
  const [intentado, setIntentado] = useState(false);

  useEffect(() => {
    if (!user) return;
    setPassword('');
    setVer(false);
    setIntentado(false);
  }, [user]);

  const error = intentado && password.length < MIN_PASSWORD ? `Usa al menos ${MIN_PASSWORD} caracteres.` : null;

  function enviar(e: React.FormEvent): void {
    e.preventDefault();
    setIntentado(true);
    if (password.length < MIN_PASSWORD) return;
    onConfirm(password);
  }

  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>Restablecer la contraseña de {user?.nombre}</DialogTitle>
            <DialogDescription>
              Su sesión actual se cerrará y tendrá que entrar con la contraseña nueva. Compártesela por
              un canal seguro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`${id}-password`}>Contraseña nueva</Label>
            <div className="relative">
              <Input
                id={`${id}-password`}
                type={ver ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                aria-invalid={error !== null}
                className="pr-10"
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setVer((v) => !v)}
                aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-0 top-0 h-full text-muted-foreground hover:bg-transparent"
              >
                {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Mínimo {MIN_PASSWORD} caracteres.</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
            >
              {pending ? 'Restableciendo…' : 'Restablecer contraseña'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
