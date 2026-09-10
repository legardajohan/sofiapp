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

interface ActivateFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nombre del flujo que quedaría desactivado. `null` si no hay ninguno activo (no debería
   *  abrirse el diálogo en ese caso, pero cubre el estado sin romper). */
  flujoActivoActual: string | null;
  onConfirm: () => void;
}

/** Confirma antes de activar un flujo que desactivaría el activo anterior (criterio 18): activar
 *  automatismos en producción no debería quedar a un clic sin aviso. */
export function ActivateFlowDialog({
  open,
  onOpenChange,
  flujoActivoActual,
  onConfirm,
}: ActivateFlowDialogProps): React.ReactElement {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Activar este flujo?</AlertDialogTitle>
          <AlertDialogDescription>
            {flujoActivoActual
              ? `Se desactivará "${flujoActivoActual}", que es el flujo activo ahora. Las conversaciones en curso con ese flujo se quedan donde están; las nuevas seguirán este.`
              : 'A partir de ahora, este flujo responderá a los mensajes entrantes de tu empresa.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Activar flujo</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
