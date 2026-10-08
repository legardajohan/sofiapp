import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatEntero, formatPorcentaje } from '@/lib/format';
import type { AdvisorReport, AdvisorRow } from '../types/index.js';

interface Props {
  report: AdvisorReport | undefined;
  isLoading: boolean;
}

type Campo = 'nombre' | 'conversacionesAtendidas' | 'asignadasActivas' | 'ventas' | 'tasaCierre';
type Orden = 'asc' | 'desc';

const COLUMNAS: Array<{ key: Campo; label: string; numerica: boolean }> = [
  { key: 'nombre', label: 'Asesor', numerica: false },
  { key: 'conversacionesAtendidas', label: 'Atendidas', numerica: true },
  { key: 'asignadasActivas', label: 'Asignadas activas', numerica: true },
  { key: 'ventas', label: 'Ventas', numerica: true },
  { key: 'tasaCierre', label: 'Tasa de cierre', numerica: true },
];

function ordenar(filas: AdvisorRow[], campo: Campo, orden: Orden): AdvisorRow[] {
  const dir = orden === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    const porNombre = a.nombre.localeCompare(b.nombre, 'es');
    if (campo === 'nombre') return porNombre * dir;
    return (a[campo] - b[campo]) * dir || porNombre;
  });
}

/**
 * Detalle por asesor: la vista accesible de lo que resume el gráfico. El orden es local (los datos
 * ya vienen completos, son pocas filas) y la fila "Sin asignar" cierra el cuadre con los totales.
 */
export function AdvisorTable({ report, isLoading }: Props): React.ReactElement {
  const [campo, setCampo] = useState<Campo>('conversacionesAtendidas');
  const [orden, setOrden] = useState<Orden>('desc');
  const filas = useMemo(() => ordenar(report?.porAsesor ?? [], campo, orden), [report, campo, orden]);
  const sinAsignar = report?.sinAsignar;
  const haySinAsignar = !!sinAsignar && sinAsignar.conversacionesAtendidas + sinAsignar.ventas > 0;

  function toggle(c: Campo): void {
    if (c === campo) setOrden(orden === 'asc' ? 'desc' : 'asc');
    else {
      setCampo(c);
      setOrden(c === 'nombre' ? 'asc' : 'desc');
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Detalle por asesor</CardTitle>
        <CardDescription>Ordena por cualquier columna; los totales incluyen lo que no tiene asesor</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNAS.map((col) => {
                  const activa = campo === col.key;
                  return (
                    <TableHead
                      key={col.key}
                      className={cn(col.numerica && 'text-right', col.key === 'nombre' && 'min-w-[180px]')}
                      aria-sort={activa ? (orden === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggle(col.key)}
                        className={cn(
                          'h-8 gap-1.5 px-2 font-medium',
                          col.numerica ? '-mr-2' : '-ml-2',
                          activa ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {col.label}
                        {!activa ? (
                          <ArrowUpDown className="size-3.5 opacity-40" aria-hidden="true" />
                        ) : orden === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="size-3.5" aria-hidden="true" />
                        )}
                      </Button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 4 }, (_, i) => (
                  <TableRow key={i}>
                    {COLUMNAS.map((col) => (
                      <TableCell key={col.key}>
                        <Skeleton className={cn('h-4', col.numerica ? 'ml-auto w-10' : 'w-32')} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!isLoading && filas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMNAS.length} className="h-24 text-center text-muted-foreground">
                    Tu empresa aún no tiene asesores con cuenta en el panel.
                  </TableCell>
                </TableRow>
              )}

              {!isLoading &&
                filas.map((f) => (
                  <TableRow key={f.asesorId}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{f.nombre}</span>
                        {!f.activo && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-medium shadow-none">
                            Inactivo
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatEntero(f.conversacionesAtendidas)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatEntero(f.asignadasActivas)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground">{formatEntero(f.ventas)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {f.conversacionesAtendidas === 0 ? '—' : formatPorcentaje(f.tasaCierre)}
                    </TableCell>
                  </TableRow>
                ))}

              {!isLoading && haySinAsignar && sinAsignar && (
                <TableRow className="text-muted-foreground">
                  <TableCell className="italic">Sin asesor asignado</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEntero(sinAsignar.conversacionesAtendidas)}</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEntero(sinAsignar.ventas)}</TableCell>
                  <TableCell className="text-right">—</TableCell>
                </TableRow>
              )}
            </TableBody>
            {!isLoading && report && filas.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEntero(report.totales.conversacionesAtendidas)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEntero(report.totales.asignadasActivas)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEntero(report.totales.ventas)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPorcentaje(report.totales.tasaCierre)}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
