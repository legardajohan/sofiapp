import { AlertCircle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  /** Motivo concreto del fallo (mensaje del backend o código HTTP), no un texto genérico. */
  message: string;
  onRetry: () => void;
}

/**
 * Estado de error de la bandeja. Existe para que un fallo de red o de API nunca se pinte como un
 * estado vacío: sin esto, un 400/401/500 se veía idéntico a "no hay conversaciones".
 */
export function InboxError({ message, onRetry }: Props): React.ReactElement {
  return (
    <div
      role="alert"
      className="flex h-full flex-1 flex-col items-center justify-center gap-1.5 p-8 text-center"
    >
      <AlertCircle className="h-7 w-7 text-destructive" />
      <p className="text-sm font-medium text-foreground">No se pudo cargar</p>
      <p className="text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
        <RotateCw className="mr-2 h-3.5 w-3.5" />
        Reintentar
      </Button>
    </div>
  );
}
