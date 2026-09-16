import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Megaphone, Plus } from 'lucide-react';
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
import { CampaignStatusBadge } from '../components/CampaignStatusBadge.js';
import { CampaignWizard } from '../components/CampaignWizard.js';
import { useCampaignRealtime, useCampaigns, useCreateCampaign } from '../hooks/useCampaigns.js';
import { ETIQUETA_ESTADO, formatearNumero, porcentaje } from '../lib/pacing.js';
import { ESTADOS_CAMPANA, type EstadoCampana } from '../types.js';

/** Radix `Select` prohíbe `value=""`, así que el "sin filtro" necesita un centinela. */
const TODOS = '__todos__';

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Historial de campañas del tenant.
 *
 * El filtro vive en la URL, como en el listado de leads: una campaña en curso es algo que se
 * comparte por chat con un compañero («mira cómo va»), y un enlace que no conserva lo que estabas
 * mirando obliga a rehacer el filtro al otro lado.
 */
export function CampaignsPage(): React.ReactElement {
  const [params, setParams] = useSearchParams();
  const [wizardOpen, setWizardOpen] = useState(false);

  const estadoParam = params.get('estado');
  const estado = ESTADOS_CAMPANA.includes(estadoParam as EstadoCampana)
    ? (estadoParam as EstadoCampana)
    : undefined;
  const page = Number(params.get('page') ?? '1') || 1;

  const { data, isPending } = useCampaigns({ page, ...(estado ? { estado } : {}) });
  const crear = useCreateCampaign();
  useCampaignRealtime();

  const campanas = data?.data ?? [];
  const hayFiltro = estado !== undefined;

  function filtrar(valor: string): void {
    const siguiente = new URLSearchParams(params);
    if (valor === TODOS) siguiente.delete('estado');
    else siguiente.set('estado', valor);
    siguiente.delete('page');
    setParams(siguiente);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-foreground">Campañas</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Escribe a un grupo de contactos con una plantilla aprobada. SofiApp reparte el envío
            para no pasarse del límite diario de tu número de WhatsApp.
          </p>
        </div>
        <Button
          onClick={() => setWizardOpen(true)}
          className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nueva campaña
        </Button>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52 space-y-1.5">
          <label className="text-sm text-muted-foreground" htmlFor="filtro-estado">
            Estado
          </label>
          <Select value={estado ?? TODOS} onValueChange={filtrar}>
            <SelectTrigger id="filtro-estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas</SelectItem>
              {ESTADOS_CAMPANA.map((e) => (
                <SelectItem key={e} value={e}>
                  {ETIQUETA_ESTADO[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hayFiltro ? (
          <Button variant="ghost" onClick={() => filtrar(TODOS)}>
            Limpiar filtro
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaña</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Destinatarios</TableHead>
              <TableHead className="text-right">Enviados</TableHead>
              <TableHead className="text-right">Creada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              // El esqueleto imita la silueta de la fila real para que el salto al cargar sea mínimo.
              Array.from({ length: 4 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : campanas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-14">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Megaphone className="h-6 w-6 text-muted-foreground" aria-hidden />
                    <p className="text-sm text-muted-foreground">
                      {hayFiltro
                        ? 'Ninguna campaña está en ese estado.'
                        : 'Todavía no has enviado ninguna campaña.'}
                    </p>
                    {!hayFiltro ? (
                      <Button variant="outline" size="sm" onClick={() => setWizardOpen(true)}>
                        Crear la primera
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              campanas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      to={`/campanas/${c.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {c.nombre}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <CampaignStatusBadge estado={c.estado} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatearNumero(c.totales.destinatarios)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatearNumero(c.totales.enviados)}
                    {c.totales.destinatarios > 0 ? (
                      <span className="ml-1.5 text-xs">
                        ({porcentaje(c.totales.enviados, c.totales.destinatarios)}%)
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fecha(c.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CampaignWizard
        open={wizardOpen}
        pending={crear.isPending}
        onOpenChange={setWizardOpen}
        onSubmit={(payload) => crear.mutate(payload, { onSuccess: () => setWizardOpen(false) })}
      />
    </div>
  );
}
