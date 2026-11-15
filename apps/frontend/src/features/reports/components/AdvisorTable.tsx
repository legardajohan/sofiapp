import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { parsearGrupoQuery, perteneceAlGrupo } from '@sofiapp/shared';
import type { FiltroRolUsuario } from '@/lib/grupos-usuarios';
import type { RolEmpresa } from '@/stores/authStore';
import { formatEntero, formatPorcentaje } from '@/lib/format';
import { formatDuracion, formatHorasMinutos } from '../lib/duracion-format.js';
import type { AdvisorReport, AdvisorRow } from '../types/index.js';

interface Props {
  /** El reporte de TODA la empresa: la tabla filtra con su propio par «rol + persona» (AUTH-06). */
  report: AdvisorReport | undefined;
  isLoading: boolean;
  filtro?: FiltroRolUsuario;
  /** Los controles del filtro, en la cabecera de la tarjeta. */
  filtroSlot?: React.ReactNode;
}

/** ¿Entra la fila en el filtro? Misma regla de pertenencia que el backend (`perteneceAlGrupo`). */
function enFiltro(f: AdvisorRow, filtro: FiltroRolUsuario | undefined): boolean {
  if (!filtro?.grupo) return true;
  if (filtro.persona) return f.asesorId === filtro.persona;
  const g = parsearGrupoQuery(filtro.grupo);
  if (!g) return true;
  if (g.tipo === 'usuario') return f.asesorId === g.usuarioId;
  return perteneceAlGrupo({ id: f.asesorId, rolEmpresa: f.rolEmpresa, coordinadorId: f.coordinadorId, esPrincipal: f.esPrincipal }, g);
}

type Campo = 'nombre' | 'conversacionesAtendidas' | 'asignadasActivas' | 'ventas' | 'tasaCierre' | 'segundosActivos';
type Orden = 'asc' | 'desc';

const COLUMNAS: Array<{ key: Campo; label: string; numerica: boolean }> = [
  { key: 'nombre', label: 'Asesor', numerica: false },
  { key: 'conversacionesAtendidas', label: 'Atendidas', numerica: true },
  { key: 'asignadasActivas', label: 'Asignadas activas', numerica: true },
  { key: 'ventas', label: 'Ventas', numerica: true },
  { key: 'tasaCierre', label: 'Tasa de cierre', numerica: true },
  { key: 'segundosActivos', label: 'Tiempo activo', numerica: true },
];

const SECCIONES_ROL: Array<{ rol: RolEmpresa; etiqueta: string }> = [
  { rol: 'asesor', etiqueta: 'Asesores' },
  { rol: 'coordinador', etiqueta: 'Coordinadores' },
  { rol: 'administrador', etiqueta: 'Administradores' },
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
 * Detalle por persona: la vista accesible de lo que resume el gráfico. AUTH-06: las filas van en
 * secciones por rol (el orden elegido se aplica dentro de cada una), para no poner a un asesor al
 * lado de un administrador como si fueran comparables. El orden es local (los datos
 * ya vienen completos, son pocas filas) y la fila "Sin asignar" cierra el cuadre con los totales.
 */
export function AdvisorTable({ report, isLoading, filtro, filtroSlot }: Props): React.ReactElement {
  const [campo, setCampo] = useState<Campo>('conversacionesAtendidas');
  const [orden, setOrden] = useState<Orden>('desc');
  const filtrado = !!filtro?.grupo;
  const filas = useMemo(
    () => ordenar((report?.porAsesor ?? []).filter((f) => enFiltro(f, filtro)), campo, orden),
    [report, campo, orden, filtro],
  );
  // Con filtro, los totales son los de las filas visibles: «sin asesor» no pertenece a ningún grupo.
  const totales = useMemo(() => {
    if (!report || !filtrado) return report?.totales;
    const suma = (k: 'conversacionesAtendidas' | 'asignadasActivas' | 'ventas' | 'segundosActivos'): number =>
      filas.reduce((s, f) => s + f[k], 0);
    const atendidas = suma('conversacionesAtendidas');
    const ventas = suma('ventas');
    return {
      asesores: filas.length,
      conversacionesAtendidas: atendidas,
      asignadasActivas: suma('asignadasActivas'),
      ventas,
      tasaCierre: atendidas ? ventas / atendidas : 0,
      segundosActivos: suma('segundosActivos'),
    };
  }, [report, filtrado, filas]);
  const secciones = useMemo(
    () =>
      SECCIONES_ROL.map((s) => ({ ...s, filas: filas.filter((f) => (f.rolEmpresa ?? 'asesor') === s.rol) })).filter(
        (s) => s.filas.length > 0,
      ),
    [filas],
  );
  const conTitulos = secciones.length > 1;
  const sinAsignar = report?.sinAsignar;
  const haySinAsignar = !filtrado && !!sinAsignar && sinAsignar.conversacionesAtendidas + sinAsignar.ventas > 0;

  function toggle(c: Campo): void {
    if (c === campo) setOrden(orden === 'asc' ? 'desc' : 'asc');
    else {
      setCampo(c);
      setOrden(c === 'nombre' ? 'asc' : 'desc');
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Detalle por persona</CardTitle>
          <CardDescription>
            {filtrado
              ? 'Ordena por cualquier columna; los totales son los de las personas filtradas'
              : 'Ordena por cualquier columna; los totales incluyen lo que no tiene asesor'}
          </CardDescription>
        </div>
        {filtroSlot}
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
                    {filtrado ? 'Nadie de este filtro tiene datos en el periodo.' : 'Tu empresa aún no tiene asesores con cuenta en el panel.'}
                  </TableCell>
                </TableRow>
              )}

              {!isLoading &&
                secciones.flatMap((s) => [
                  ...(conTitulos
                    ? [
                        <TableRow key={`s-${s.rol}`} className="hover:bg-transparent">
                          <TableCell colSpan={COLUMNAS.length} className="bg-muted/40 py-1.5 text-xs font-medium text-muted-foreground">
                            {s.etiqueta}
                          </TableCell>
                        </TableRow>,
                      ]
                    : []),
                  ...s.filas.map((f) => (
                    <TableRow key={f.asesorId}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{f.nombre}</span>
                          {f.esPrincipal && <span className="text-xs text-muted-foreground">principal</span>}
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
                      <TableCell className="text-right tabular-nums" title={formatDuracion(f.segundosActivos)}>
                        {f.segundosActivos === 0 ? '—' : formatHorasMinutos(f.segundosActivos)}
                      </TableCell>
                    </TableRow>
                  )),
                ])}

              {!isLoading && haySinAsignar && sinAsignar && (
                <TableRow className="text-muted-foreground">
                  <TableCell className="italic">Sin asesor asignado</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEntero(sinAsignar.conversacionesAtendidas)}</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEntero(sinAsignar.ventas)}</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">—</TableCell>
                </TableRow>
              )}
            </TableBody>
            {!isLoading && report && totales && filas.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEntero(totales.conversacionesAtendidas)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEntero(totales.asignadasActivas)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEntero(totales.ventas)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPorcentaje(totales.tasaCierre)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatHorasMinutos(totales.segundosActivos)}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
