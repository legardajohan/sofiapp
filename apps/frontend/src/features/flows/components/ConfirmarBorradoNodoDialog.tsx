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

interface ConfirmarBorradoNodoDialogProps {
  open: boolean;
  /** Nombres de lo que se va a borrar (nodos). */
  nodos: string[];
  /** Conexiones que se quitarán, ya redactadas («A → B»). */
  conexiones: string[];
  onConfirmar: () => void;
  onCancelar: () => void;
}

const MAX_VISIBLES = 5;

/** Aviso antes de borrar un nodo CON conexiones: dice cuáles se van a quitar. Sin conexiones no se usa. */
export function ConfirmarBorradoNodoDialog({
  open,
  nodos,
  conexiones,
  onConfirmar,
  onCancelar,
}: ConfirmarBorradoNodoDialogProps): React.ReactElement {
  const titulo = nodos.length === 1 ? `¿Borrar «${nodos[0]}»?` : `¿Borrar ${nodos.length} nodos?`;
  const n = conexiones.length;
  const visibles = conexiones.slice(0, MAX_VISIBLES);
  return (
    <AlertDialog open={open} onOpenChange={(abierto) => !abierto && onCancelar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                {n === 1 ? 'Se quitará 1 conexión' : `Se quitarán ${n} conexiones`}. Los nodos que llegaban a
                este quedarán con esa rama sin destino y tendrás que reconectarlos.
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-foreground">
                {visibles.map((c) => (
                  <li key={c}>{c}</li>
                ))}
                {n > visibles.length ? <li>y {n - visibles.length} más…</li> : null}
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancelar}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmar}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Borrar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
