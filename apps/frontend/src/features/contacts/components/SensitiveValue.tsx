import { Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { MOTIVO_DATOS_SENSIBLES } from '@/lib/roles';

interface Props {
  /** Ya viene enmascarado del backend cuando no hay permiso; aquí nunca se enmascara nada. */
  valor: string | null;
  oculto: boolean;
  /** Qué se lee cuando el contacto sencillamente no tiene ese dato. */
  vacio?: string;
  className?: string;
}

/**
 * Un dato sensible del contacto. Distingue tres estados que la UI **no** puede confundir:
 * el dato en claro, el dato oculto por permisos, y la ausencia del dato. Sin esa distinción el
 * asesor volvería a pedirle al cliente un correo que ya está registrado.
 *
 * El candado es la única señal nueva que este feature introduce en la ficha, así que carga todo el
 * peso: nada más cambia de forma o color respecto de los campos de al lado.
 */
export function SensitiveValue({
  valor,
  oculto,
  vacio = 'Sin registrar',
  className,
}: Props): React.ReactElement {
  if (valor === null) {
    return (
      <span className={cn('italic text-muted-foreground', className)}>{vacio}</span>
    );
  }

  if (!oculto) {
    return <span className={cn('font-medium text-foreground', className)}>{valor}</span>;
  }

  return (
    // Provider propio: la ficha vive dentro del AppShell (que ya monta uno), pero así el componente
    // funciona aislado en tests. `delayDuration` corto — es una explicación, no un tooltip de barra.
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex cursor-help items-center gap-1 text-muted-foreground',
              className,
            )}
          >
            <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
            {/* `tabular-nums` para que los puntos del enmascarado no bailen entre filas. */}
            <span className="tabular-nums">{valor}</span>
            <span className="sr-only">— {MOTIVO_DATOS_SENSIBLES}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">{MOTIVO_DATOS_SENSIBLES}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
