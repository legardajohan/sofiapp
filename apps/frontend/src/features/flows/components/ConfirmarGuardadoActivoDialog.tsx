import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import type { ErrorGrafo } from '@sofiapp/shared';

/** Cuántos pendientes se listan antes de resumir el resto: el modal decide, no es el panel de errores. */
const MAX_LISTADOS = 5;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lo que quedó pendiente, con el nombre del nodo ya dentro del mensaje. */
  errores: ErrorGrafo[];
  /** Guarda los cambios y deja el flujo inactivo (`confirmarDesactivar`). */
  onGuardarYDesactivar: () => void;
  /** Sale del editor sin enviar nada; los cambios quedan como borrador local. */
  onNoGuardar: () => void;
}

/**
 * Confirmación al guardar un flujo que está EN PRODUCCIÓN y quedó con errores (HU-FLOW-05, criterio
 * 29). Nunca se guarda ni se desactiva en silencio: esta decisión apaga la atención automática de la
 * empresa, así que el modal dice con claridad qué pasa y da tres salidas.
 *
 * El foco inicial cae en «Cancelar» (comportamiento de `AlertDialog`) y `Esc` equivale a Cancelar: la
 * acción que desactiva producción nunca es la que se activa con un Enter distraído.
 */
export function ConfirmarGuardadoActivoDialog({
  open,
  onOpenChange,
  errores,
  onGuardarYDesactivar,
  onNoGuardar,
}: Props): React.ReactElement {
  const visibles = errores.slice(0, MAX_LISTADOS);
  const restantes = errores.length - visibles.length;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            Este flujo está en producción y tiene errores
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Si guardas, el flujo quedará <strong className="font-semibold text-foreground">inactivo</strong> y
                tus clientes serán atendidos por Sofi (la IA general) hasta que corrijas los errores y lo actives
                de nuevo.
              </p>
              {visibles.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-foreground">Pendiente de corregir:</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-xs">
                    {visibles.map((e, i) => (
                      <li key={`${e.nodoId}-${e.codigo}-${i}`}>{e.mensaje}</li>
                    ))}
                    {restantes > 0 ? <li>y {restantes} más</li> : null}
                  </ul>
                </div>
              ) : null}
              <p className="text-xs">
                Si eliges «No guardar», sales del editor y tus cambios quedan como borrador en este navegador para
                retomarlos después.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: 'outline' })} onClick={onNoGuardar}>
            No guardar
          </AlertDialogAction>
          <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={onGuardarYDesactivar}>
            Guardar y desactivar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
