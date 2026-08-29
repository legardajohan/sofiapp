import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme/ThemeProvider';
import { tagColors } from '@/features/tags/lib/tag-color';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { COLOR_ESTADO_DESCONOCIDO, fechaCorta, haceCuanto } from '../lib/format.js';
import type { EstadoDTO } from '../../estados/types.js';
import type { LeadListItemDTO } from '../types.js';
import type { Paginated } from '../../inbox/types.js';

interface Props {
  datos: Paginated<LeadListItemDTO> | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Distingue el vacío "no tienes leads" del vacío "tus filtros no casan con nada". */
  hayFiltros: boolean;
  onClearFiltros: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPageChange: (page: number) => void;
  /** Catálogo del tenant para resolver etiqueta y color de cada estado. */
  estados: EstadoDTO[];
}

/**
 * El estado del lead pintado con el color que la empresa le dio.
 *
 * El color sale del catálogo (`estados`, HU-CRM-03), nunca de un `variant` fijo: las etapas son
 * datos del tenant y una empresa puede añadir "Visita agendada" o llamar "Ganado" a lo que aquí
 * era "pagado". Se pasa por `tagColors` —el mismo motor que los chips de etiqueta— para que un hex
 * desafortunado siga siendo legible en claro y en oscuro.
 *
 * Si la clave no está en el catálogo se pinta la clave cruda antes que un hueco: significa que el
 * estado se archivó o que el catálogo aún no cargó, y esconderlo sería mentir sobre el lead.
 */
function EstadoBadge({
  estado,
  estados,
}: {
  estado: LeadListItemDTO['estado'];
  estados: EstadoDTO[];
}): React.ReactElement {
  const { resolvedTheme } = useTheme();
  const delCatalogo = estados.find((e) => e.key === estado);
  const { bg, fg, border } = tagColors(
    delCatalogo?.color ?? COLOR_ESTADO_DESCONOCIDO,
    resolvedTheme === 'dark' ? 'dark' : 'light',
  );

  return (
    <span
      className="inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-xs font-medium leading-tight"
      style={{ backgroundColor: bg, color: fg, borderColor: border }}
    >
      <span className="truncate">{delCatalogo?.label ?? estado}</span>
    </span>
  );
}

/** Punto de color de una etiqueta. El color lo decide el tenant, por eso va en `style`. */
function Punto({ color }: { color: string }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

/**
 * Semáforo comercial del lead (HU-CRM-04).
 *
 * Uno solo, y por construcción: desde que es un campo del lead ya no puede haber varios, así
 * que el `+N` que existía cuando salía de las etiquetas de la conversación sobra. Un lead sin
 * clasificar muestra un guion antes que un hueco: la columna se escanea de arriba abajo y una
 * celda vacía se lee como un fallo de carga.
 */
function SemaforoCell({
  semaforo,
}: {
  semaforo: LeadListItemDTO['semaforo'];
}): React.ReactElement {
  if (!semaforo) return <span className="text-muted-foreground">—</span>;

  return (
    <span className="flex items-center gap-2">
      <Punto color={semaforo.color} />
      <span className="whitespace-nowrap text-secondary-foreground">{semaforo.label}</span>
    </span>
  );
}

function Fila({
  lead,
  seleccionado,
  onSelect,
  estados,
}: {
  lead: LeadListItemDTO;
  seleccionado: boolean;
  onSelect: (id: string) => void;
  estados: EstadoDTO[];
}): React.ReactElement {
  return (
    <TableRow
      // La fila es el control: alcanzable con Tab y accionable con Enter o Espacio, no solo con
      // el ratón. Sin esto el detalle quedaría fuera del alcance del teclado.
      tabIndex={0}
      role="button"
      aria-label={`Ver el lead ${lead.nombre}`}
      onClick={() => onSelect(lead.id)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onSelect(lead.id);
      }}
      data-state={seleccionado ? 'selected' : undefined}
      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <TableCell>
        <span className="font-medium text-foreground">{lead.nombre}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{lead.telefono}</span>
      </TableCell>
      <TableCell>
        <EstadoBadge estado={lead.estado} estados={estados} />
      </TableCell>
      <TableCell>
        <SemaforoCell semaforo={lead.semaforo} />
      </TableCell>
      <TableCell className="text-secondary-foreground">
        {lead.responsable?.nombre ?? 'Sin responsable'}
      </TableCell>
      <TableCell className="text-secondary-foreground">
        {haceCuanto(lead.ultimoMensajeAt)}
      </TableCell>
      <TableCell className="text-right text-secondary-foreground">
        {fechaCorta(lead.createdAt)}
      </TableCell>
    </TableRow>
  );
}

export function LeadsTable({
  datos,
  isLoading,
  isError,
  onRetry,
  hayFiltros,
  onClearFiltros,
  selectedId,
  onSelect,
  onPageChange,
  estados,
}: Props): React.ReactElement {
  const leads = datos?.data ?? [];
  const total = datos?.total ?? 0;
  const page = datos?.page ?? 1;
  const limit = datos?.limit ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Leads</h2>
          {datos && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {total === 0 ? 'Ninguno todavía' : `${total} ${total === 1 ? 'lead' : 'leads'}`}
            </p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 px-6 py-5">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      ) : isError ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-destructive">No se pudo cargar el listado de leads.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Reintentar
          </Button>
        </div>
      ) : leads.length === 0 ? (
        // Dos vacíos distintos a propósito: decirle "no tienes leads" a quien sí los tiene, pero
        // filtrados fuera, es desinformar. El segundo ofrece además la salida.
        <div className="px-6 py-12 text-center">
          {hayFiltros ? (
            <>
              <p className="text-sm font-medium text-foreground">
                Ningún lead coincide con estos filtros
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Prueba a ampliar el rango de fechas o a quitar alguno.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={onClearFiltros}>
                Limpiar filtros
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">Todavía no hay leads</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                En cuanto conviertas una conversación en lead, aparece aquí.
              </p>
            </>
          )}
        </div>
      ) : (
        // La tabla scrollea dentro de su propio contenedor: el `body` nunca en horizontal.
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Semáforo</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Última actividad</TableHead>
                <TableHead className="text-right">Creado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <Fila
                  key={lead.id}
                  lead={lead}
                  seleccionado={selectedId === lead.id}
                  onSelect={onSelect}
                  estados={estados}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-6 py-3 text-sm">
          <span className="text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
