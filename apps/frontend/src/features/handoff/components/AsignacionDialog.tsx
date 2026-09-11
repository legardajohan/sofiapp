import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAsesorMetricas } from '../hooks/useAsesorMetricas.js';
import { CargaBar } from './CargaBar.js';

interface AsignacionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Las columnas del desglose, en el orden de la máquina de estados de `docs/domain.md` §3. */
const CARTERA = [
  { key: 'nuevo', label: 'Nuevas' },
  { key: 'en_gestion', label: 'En gestión' },
  { key: 'pago_pendiente', label: 'Por pagar' },
] as const;

/**
 * Cómo está repartido el trabajo entre los asesores (HU-IA-07).
 *
 * **La barra codifica solo las conversaciones activas.** El primer boceto apilaba los cinco estados
 * en una barra por asesor; se descartó por dos motivos y el segundo es el que manda: (a) no existen
 * cinco tokens de color accesibles en el proyecto —`tagColors` es para colores que vienen de la base
 * de datos—, y (b) la pregunta que trae aquí a alguien es «quién está más cargado», que es una sola
 * variable, y una sola variable se lee mejor en una sola barra. El desglose vive en las columnas.
 */
export function AsignacionDialog({ open, onOpenChange }: AsignacionDialogProps): React.ReactElement {
  const { data, isPending, isError, refetch } = useAsesorMetricas(open);

  // Ordenado por carga, descendente: el orden es información, y quien abre esto busca al saturado.
  const filas = [...(data ?? [])].sort((a, b) => b.activas - a.activas);
  const maximo = filas[0]?.activas ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cómo está repartido el trabajo</DialogTitle>
          <DialogDescription>
            Conversaciones sin cerrar por asesor. Son totales, sin rango de fechas.
          </DialogDescription>
        </DialogHeader>

        {isPending && open ? (
          <div className="space-y-2" aria-live="polite" aria-busy="true">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError ? (
          <div role="alert" className="space-y-3 rounded-lg bg-destructive-subtle p-4">
            <p className="text-sm text-foreground">
              No se pudo cargar el reparto de conversaciones.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </div>
        ) : filas.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            Todavía no hay asesores activos en tu empresa. Da de alta o reactiva a alguien desde
            Usuarios para poder repartir las transferencias.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asesor</TableHead>
                  <TableHead className="w-[38%]">Activas</TableHead>
                  {CARTERA.map((c) => (
                    <TableHead key={c.key} className="text-right">
                      {c.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Pagadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((fila) => (
                  <TableRow key={fila.asesorId}>
                    <TableCell className="font-medium text-foreground">{fila.nombre}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CargaBar valor={fila.activas} maximo={maximo} />
                        <span className="w-6 shrink-0 text-right tabular-nums">{fila.activas}</span>
                      </div>
                    </TableCell>
                    {CARTERA.map((c) => (
                      <TableCell key={c.key} className="text-right tabular-nums">
                        {fila.porEstado[c.key] ?? 0}
                      </TableCell>
                    ))}
                    {/* Separada del resto: es la única métrica de desempeño de la fila, y mezclarla
                        con la cartera viva invitaría a sumarlas. */}
                    <TableCell className="border-l border-border text-right font-medium tabular-nums text-foreground">
                      {fila.porEstado['pagado'] ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          «Activas» son las conversaciones que no están pagadas ni perdidas.
        </p>
      </DialogContent>
    </Dialog>
  );
}
