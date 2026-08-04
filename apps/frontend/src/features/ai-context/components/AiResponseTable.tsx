import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useAiContextStore } from '../store/useAiContextStore.js';
import { useAiResponses } from '../hooks/useAiResponses.js';
import { METHOD_LABEL, formatDateTime, formatDuration } from '../lib/format.js';
import type { AiUsageMethod } from '../types.js';

const TODOS = '__todos__';
const METHODS: AiUsageMethod[] = ['chat', 'extract', 'classify', 'summary'];

interface Props {
  page: number;
  onPageChange: (page: number) => void;
  method: AiUsageMethod | undefined;
  onMethodChange: (method: AiUsageMethod | undefined) => void;
}

function OrigenBadge({
  cacheHit,
  fromFaq,
}: {
  cacheHit: boolean;
  fromFaq: boolean;
}): React.ReactElement {
  if (fromFaq) return <Badge variant="secondary">FAQ</Badge>;
  if (cacheHit) return <Badge variant="outline">Caché</Badge>;
  return <Badge>Generada</Badge>;
}

export function AiResponseTable({
  page,
  onPageChange,
  method,
  onMethodChange,
}: Props): React.ReactElement {
  const { data, isLoading, isError, refetch } = useAiResponses(page, method);
  const selectedId = useAiContextStore((s) => s.selectedId);
  const select = useAiContextStore((s) => s.select);

  const responses = data?.data ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Respuestas de la IA</h2>
          {data && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {total === 0
                ? 'Ninguna todavía'
                : `${total} ${total === 1 ? 'respuesta' : 'respuestas'}`}
            </p>
          )}
        </div>
        <Select
          value={method ?? TODOS}
          onValueChange={(v) => {
            onPageChange(1);
            onMethodChange(v === TODOS ? undefined : (v as AiUsageMethod));
          }}
        >
          <SelectTrigger aria-label="Filtrar por método" className="h-8 w-44 text-xs">
            <SelectValue placeholder="Método" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los métodos</SelectItem>
            {METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {METHOD_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3 px-6 py-5">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      ) : isError ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-destructive">No se pudo cargar la lista de respuestas.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : responses.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            Todavía no hay respuestas registradas
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            En cuanto la IA conteste un chat, la respuesta aparece aquí con su prompt y su
            contexto.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {responses.map((r) => (
                <TableRow
                  key={r.id}
                  onClick={() => select(r.id)}
                  data-state={selectedId === r.id ? 'selected' : undefined}
                  className="cursor-pointer"
                >
                  <TableCell className="text-secondary-foreground">
                    {formatDateTime(r.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    {METHOD_LABEL[r.method]}
                  </TableCell>
                  <TableCell className="text-secondary-foreground">{r.model}</TableCell>
                  <TableCell>
                    <OrigenBadge cacheHit={r.cacheHit} fromFaq={r.fromFaq} />
                  </TableCell>
                  <TableCell className="text-secondary-foreground">
                    {formatDuration(r.durationMs)}
                  </TableCell>
                  <TableCell className="text-right text-secondary-foreground">
                    {r.tokens.total}
                  </TableCell>
                </TableRow>
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
