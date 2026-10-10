import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  title: string;
  description: string;
  isLoading: boolean;
  /** Acción a la derecha del título (p. ej. las pestañas de una gráfica con dos vistas). */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/** Marco común de las gráficas del tablero: título que nombra la serie + estado de carga. */
export function ChartCard({ title, description, isLoading, action, children }: Props): React.ReactElement {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading ? <Skeleton className="h-[240px] w-full" aria-busy="true" /> : children}
      </CardContent>
    </Card>
  );
}

/** Vacío de una gráfica: dice qué falta, no solo que no hay nada. */
export function ChartEmpty({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-lg border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
