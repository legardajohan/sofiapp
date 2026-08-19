import { useEffect, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { MOTIVOS_ELIMINACION, type MotivoEliminacion } from '../types.js';

interface Props {
  open: boolean;
  pending: boolean;
  /** Nombre del lead, para que el diálogo confirme sobre QUÉ se está decidiendo. */
  nombre: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (motivo: MotivoEliminacion) => void;
}

/**
 * Confirmación de borrado. `AlertDialog` y no `Dialog`: interrumpe, no se cierra al hacer clic
 * fuera y el foco entra en Cancelar — el tratamiento que merece una acción irreversible.
 *
 * El motivo es parte de la confirmación, no un paso aparte: sin él no hay botón que pulsar.
 */
export function DeleteLeadDialog({
  open,
  pending,
  nombre,
  onOpenChange,
  onConfirm,
}: Props): React.ReactElement {
  const [motivo, setMotivo] = useState<MotivoEliminacion | ''>('');
  // El desplegable se monta DENTRO del diálogo, no en `document.body`: fuera de aquí queda al
  // margen de la trampa de foco del `AlertDialog` y del `aria-hidden` que aplica al abrirse, y
  // los dos acaban disputándose el foco.
  const [contenedor, setContenedor] = useState<HTMLDivElement | null>(null);

  // Cada apertura empieza sin motivo: heredar el de la vez anterior es justo el error que un
  // borrado irreversible no puede permitirse.
  useEffect(() => {
    if (open) setMotivo('');
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md" ref={setContenedor}>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar el lead de {nombre}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se elimina definitivamente, con su trazabilidad. La conversación y su historial se
            quedan como están, y vuelve a poder convertirse en lead.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="lead-motivo">Motivo</Label>
          <Select
            value={motivo}
            onValueChange={(v) => setMotivo(v as MotivoEliminacion)}
            disabled={pending}
          >
            <SelectTrigger id="lead-motivo" className="w-full">
              <SelectValue placeholder="Elige un motivo" />
            </SelectTrigger>
            <SelectContent container={contenedor}>
              {MOTIVOS_ELIMINACION.map((m) => (
                <SelectItem key={m.valor} value={m.valor}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Queda registrado en el historial junto a quién lo eliminó.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!motivo || pending}
            onClick={(e) => {
              // Igual que el borrado de etiquetas: el cierre lo decide la mutación. Si el backend
              // falla, el diálogo sigue en pie con el error en el toast.
              e.preventDefault();
              if (motivo) onConfirm(motivo);
            }}
            className={cn(
              buttonVariants({ variant: 'destructive' }),
              'transition-transform duration-150 ease-out motion-safe:active:scale-[0.97]',
            )}
          >
            {pending ? 'Eliminando…' : 'Eliminar lead'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
