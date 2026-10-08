import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { EstadoTenant } from '../../admin-tenants/types/index.js';
import { ESTADO_TENANT_LABEL, ESTADOS_TENANT, formatEntero, formatPorcentaje } from '../lib/format.js';
import type { MetricsFilters } from '../hooks/useMetricsFilters.js';
import type { GlobalMetrics, MetricsSortField } from '../types/index.js';

interface Props {
  porEmpresa: GlobalMetrics['porEmpresa'] | undefined;
  isLoading: boolean;
  /** Hay una petición en vuelo con datos previos en pantalla (cambio de página/orden). */
  isFetching: boolean;
  filters: MetricsFilters;
}

const TODOS = 'todos';

const COLUMNAS: Array<{ key: MetricsSortField; label: string; numerica: boolean }> = [
  { key: 'nombre', label: 'Empresa', numerica: false },
  { key: 'usuarios', label: 'Usuarios', numerica: true },
  { key: 'conversaciones', label: 'Conversaciones', numerica: true },
  { key: 'mensajes', label: 'Mensajes', numerica: true },
  { key: 'leads', label: 'Leads', numerica: true },
  { key: 'ventas', label: 'Ventas', numerica: true },
  { key: 'tasaConversion', label: 'Conversión', numerica: true },
  { key: 'campanas', label: 'Campañas', numerica: true },
];

const ESTADO_VARIANT: Record<EstadoTenant, 'success' | 'secondary' | 'destructive'> = {
  activo: 'success',
  prueba: 'secondary',
  suspendido: 'destructive',
};

function SortIcon({ activa, order }: { activa: boolean; order: 'asc' | 'desc' }): React.ReactElement {
  if (!activa) return <ArrowUpDown className="size-3.5 opacity-40" aria-hidden="true" />;
  return order === 'asc' ? (
    <ArrowUp className="size-3.5" aria-hidden="true" />
  ) : (
    <ArrowDown className="size-3.5" aria-hidden="true" />
  );
}

/**
 * Desglose por empresa: la vista completa (y accesible) de lo que resumen las gráficas.
 * Orden, búsqueda, filtro y página viven en la URL; el consolidado de arriba no cambia con ellos.
 */
export function TenantMetricsTable({ porEmpresa, isLoading, isFetching, filters }: Props): React.ReactElement {
  const { sort, order, search, estado, setSearch, setEstado, toggleSort, setPage } = filters;
  const total = porEmpresa?.total ?? 0;
  const page = porEmpresa?.page ?? 1;
  const limit = porEmpresa?.limit ?? 20;
  const paginas = Math.max(1, Math.ceil(total / limit));
  const desdeN = total === 0 ? 0 : (page - 1) * limit + 1;
  const hastaN = Math.min(page * limit, total);
  const hayFiltros = search.trim() !== '' || estado !== undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Desglose por empresa</CardTitle>
          <CardDescription>Ordena por cualquier columna para encontrar a quién atender primero</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa"
              aria-label="Buscar empresa por nombre o identificador"
              className="w-56 pl-8"
            />
          </div>
          <Select value={estado ?? TODOS} onValueChange={(v) => setEstado(v === TODOS ? undefined : (v as EstadoTenant))}>
            <SelectTrigger className="w-40" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los estados</SelectItem>
              {ESTADOS_TENANT.map((e) => (
                <SelectItem key={e} value={e}>
                  {ESTADO_TENANT_LABEL[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className={cn('overflow-x-auto rounded-md border border-border transition-opacity', isFetching && 'opacity-60')}>
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNAS.map((col) => {
                  const activa = sort === col.key;
                  return (
                    <TableHead
                      key={col.key}
                      className={cn(col.numerica && 'text-right', col.key === 'nombre' && 'min-w-[200px]')}
                      aria-sort={activa ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          'h-8 gap-1.5 px-2 font-medium',
                          col.numerica ? '-mr-2' : '-ml-2',
                          activa ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {col.label}
                        <SortIcon activa={activa} order={order} />
                      </Button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i}>
                    {COLUMNAS.map((col) => (
                      <TableCell key={col.key}>
                        <Skeleton className={cn('h-4', col.numerica ? 'ml-auto w-10' : 'w-36')} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!isLoading && porEmpresa?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMNAS.length} className="h-24 text-center text-muted-foreground">
                    {hayFiltros ? (
                      <>
                        Ninguna empresa coincide con la búsqueda.{' '}
                        <Button
                          variant="link"
                          className="h-auto p-0"
                          onClick={() => {
                            setSearch('');
                            setEstado(undefined);
                          }}
                        >
                          Quitar filtros
                        </Button>
                      </>
                    ) : (
                      'Aún no hay empresas registradas. Créalas desde Empresas.'
                    )}
                  </TableCell>
                </TableRow>
              )}

              {!isLoading &&
                porEmpresa?.items.map((fila) => (
                  <TableRow key={fila.tenantId}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-foreground">{fila.nombre}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <Badge variant={ESTADO_VARIANT[fila.estado]} className="px-1.5 py-0 text-[11px] font-medium shadow-none">
                            {ESTADO_TENANT_LABEL[fila.estado]}
                          </Badge>
                          {fila.plan?.nombre ?? 'Sin plan'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatEntero(fila.usuarios)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEntero(fila.conversaciones)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEntero(fila.mensajes)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEntero(fila.leads)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground">{formatEntero(fila.ventas)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fila.leads === 0 ? '—' : formatPorcentaje(fila.tasaConversion)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatEntero(fila.campanas)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {formatEntero(desdeN)}–{formatEntero(hastaN)} de {formatEntero(total)} empresas
            </span>
            {paginas > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <span className="tabular-nums">
                  Página {page} de {paginas}
                </span>
                <Button variant="outline" size="sm" disabled={page >= paginas} onClick={() => setPage(page + 1)}>
                  Siguiente
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
