import { Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyFlowStateProps {
  onCrearInicio: () => void;
}

/** Se muestra en vez del canvas cuando el flujo no tiene nodos (criterio 16): un canvas en blanco
 *  sin affordance deja al admin sin saber por dónde empezar. */
export function EmptyFlowState({ onCrearInicio }: EmptyFlowStateProps): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Workflow className="h-6 w-6" />
      </div>
      <div className="max-w-sm space-y-1">
        <h3 className="text-sm font-medium text-foreground">Este flujo todavía no tiene nodos</h3>
        <p className="text-sm text-muted-foreground">
          Empieza por el nodo de inicio: el primer mensaje que ve el cliente al entrar al flujo.
          Si necesitas manejar varios temas a la vez (horarios, precios, ventas), usa un nodo de
          Intención como punto de entrada para enrutar cada uno.
        </p>
      </div>
      <Button onClick={onCrearInicio}>Crear nodo de inicio</Button>
    </div>
  );
}
