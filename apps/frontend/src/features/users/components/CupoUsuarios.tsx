import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { CupoUsuarios as Cupo } from '../types.js';

interface Props {
  cupo: Cupo | undefined;
}

function Medidor({
  etiqueta,
  usado,
  limite,
}: {
  etiqueta: string;
  usado: number;
  limite: number | null;
}): React.ReactElement {
  const lleno = limite !== null && usado >= limite;
  const porcentaje = limite && limite > 0 ? Math.min(100, Math.round((usado / limite) * 100)) : 0;
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{etiqueta}</span>
        <span className={cn('tabular-nums font-medium', lleno ? 'text-destructive' : 'text-foreground')}>
          {limite === null ? usado : `${usado} de ${limite}`}
        </span>
      </p>
      {limite !== null && (
        <Progress
          value={porcentaje}
          aria-label={`${etiqueta}: ${usado} de ${limite}`}
          className={cn('h-1.5', lleno && '[&>div]:bg-destructive bg-destructive/20')}
        />
      )}
    </div>
  );
}

/**
 * Cuántos puestos del plan usa la empresa (AUTH-05). Cuentan los usuarios activos; un eliminado o
 * desactivado libera su puesto. Sin plan asignado no hay límite y solo se muestra el conteo.
 */
export function CupoUsuarios({ cupo }: Props): React.ReactElement | null {
  if (!cupo) return null;
  const { usuarios, administradores } = cupo;
  const sinPlan = usuarios.limite === null;
  const lleno =
    (usuarios.limite !== null && usuarios.usado >= usuarios.limite) ||
    (administradores.limite !== null && administradores.usado >= administradores.limite);

  return (
    <section aria-label="Uso del plan" className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
        <Medidor etiqueta="Usuarios activos" usado={usuarios.usado} limite={usuarios.limite} />
        <Medidor etiqueta="Administradores" usado={administradores.usado} limite={administradores.limite} />
      </div>
      {(sinPlan || lleno) && (
        <p className={cn('mt-2 text-sm', lleno ? 'text-destructive' : 'text-muted-foreground')}>
          {lleno
            ? 'Llegaste al límite del plan. Desactiva o elimina a alguien, o pide al superadministrador que lo amplíe.'
            : 'La empresa aún no tiene plan asignado: no hay límite de usuarios.'}
        </p>
      )}
    </section>
  );
}
