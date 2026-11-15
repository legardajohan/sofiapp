import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { getTenantPrincipal, resetTenantPrincipalPassword } from '@/api/admin-tenants';
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
import { Skeleton } from '@/components/ui/skeleton';
import type { ITenant } from '../types/index.js';

const MIN_PASSWORD = 8;

interface Props {
  /** Empresa cuyo usuario principal recupera el acceso; `null` = cerrado. */
  tenant: ITenant | null;
  onOpenChange: (abierto: boolean) => void;
}

function mensajeDe(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
    return error.response.data.message;
  }
  return fallback;
}

/**
 * AUTH-05: el usuario principal solo cambia su contraseña con la actual. Si la olvidó, el
 * superadministrador es el único que puede restablecerla, desde aquí.
 */
export function ResetPrincipalPasswordDialog({ tenant, onOpenChange }: Props): React.ReactElement {
  const id = useId();
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [ver, setVer] = useState(false);
  const [intentado, setIntentado] = useState(false);

  const principal = useQuery({
    queryKey: ['admin', 'tenants', tenant?._id, 'principal'],
    queryFn: () => getTenantPrincipal(tenant!._id),
    enabled: tenant !== null,
    retry: false,
  });

  const restablecer = useMutation({
    mutationFn: (nueva: string) => resetTenantPrincipalPassword(tenant!._id, nueva),
    onSuccess: () => {
      toast.success(`Contraseña restablecida. ${principal.data?.nombre ?? 'El usuario'} tendrá que entrar con la nueva.`);
      onOpenChange(false);
    },
    onError: (error) => toast.error(mensajeDe(error, 'No se pudo restablecer la contraseña.')),
  });

  useEffect(() => {
    if (!tenant) return;
    setPassword('');
    setConfirmacion('');
    setVer(false);
    setIntentado(false);
  }, [tenant]);

  const errores = {
    password: password.length < MIN_PASSWORD ? `Usa al menos ${MIN_PASSWORD} caracteres.` : null,
    confirmacion: confirmacion !== password ? 'Las contraseñas no coinciden.' : null,
  };

  function enviar(e: React.FormEvent): void {
    e.preventDefault();
    setIntentado(true);
    if (errores.password || errores.confirmacion) return;
    restablecer.mutate(password);
  }

  const sinPrincipal = principal.isError;
  const pending = restablecer.isPending;

  return (
    <Dialog open={tenant !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>Restablecer la contraseña del usuario principal</DialogTitle>
            <DialogDescription>
              Se cerrarán sus sesiones abiertas. Compártele la contraseña nueva por un canal seguro.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm">
            {principal.isLoading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : sinPrincipal ? (
              <p className="text-muted-foreground">
                {mensajeDe(principal.error, 'Esta empresa no tiene usuario principal.')}
              </p>
            ) : (
              <>
                <p className="font-medium text-foreground">{principal.data?.nombre}</p>
                <p className="text-muted-foreground">
                  {principal.data?.email} · {tenant?.nombre}
                </p>
              </>
            )}
          </div>

          {!sinPrincipal && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-password`}>Contraseña nueva</Label>
                <div className="relative">
                  <Input
                    id={`${id}-password`}
                    type={ver ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    aria-invalid={intentado && errores.password !== null}
                    className="pr-10"
                    autoFocus
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
                {intentado && errores.password ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errores.password}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Mínimo {MIN_PASSWORD} caracteres.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${id}-confirmacion`}>Repite la contraseña nueva</Label>
                <Input
                  id={`${id}-confirmacion`}
                  type={ver ? 'text' : 'password'}
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={intentado && errores.confirmacion !== null}
                />
                {intentado && errores.confirmacion && (
                  <p className="text-sm text-destructive" role="alert">
                    {errores.confirmacion}
                  </p>
                )}
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {sinPrincipal ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!sinPrincipal && (
              <Button
                type="submit"
                disabled={pending || principal.isLoading}
                className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
              >
                {pending ? 'Restableciendo…' : 'Restablecer contraseña'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
