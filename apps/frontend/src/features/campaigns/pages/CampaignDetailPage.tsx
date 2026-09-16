import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { TemplatePreview } from '@/features/whatsapp-templates/components/TemplatePreview';
import { CampaignProgress } from '../components/CampaignProgress.js';
import { CampaignStatusBadge } from '../components/CampaignStatusBadge.js';
import {
  useCampaign,
  useCampaignRealtime,
  useCancelCampaign,
  useLaunchCampaign,
  usePauseCampaign,
  useRecipients,
  useResumeCampaign,
} from '../hooks/useCampaigns.js';
import { ETIQUETA_DESTINATARIO } from '../lib/pacing.js';
import { ESTADOS_DESTINATARIO, type EstadoDestinatario } from '../types.js';

const TODOS = '__todos__';

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Detalle de una campaña: cómo va, qué se mandó y a quién.
 *
 * La tabla de destinatarios es la parte que se consulta cuando algo salió mal, así que se filtra
 * por estado y muestra el motivo real que devolvió Meta en cada fila fallida. Sin ese texto, un
 * «12 fallidos» no se puede accionar.
 */
export function CampaignDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoDestinatario | undefined>();
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);

  const { data: campana, isPending } = useCampaign(id);
  const { data: destinatarios } = useRecipients(id, {
    page: 1,
    ...(estadoFiltro ? { estado: estadoFiltro } : {}),
  });
  useCampaignRealtime();

  const lanzar = useLaunchCampaign();
  const pausar = usePauseCampaign();
  const reanudar = useResumeCampaign();
  const cancelar = useCancelCampaign();

  if (isPending || !campana) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const enMarcha = campana.estado === 'en_curso';
  const pausada = campana.estado === 'pausada';
  const cancelable = enMarcha || pausada || campana.estado === 'programada';
  const ocupado =
    lanzar.isPending || pausar.isPending || reanudar.isPending || cancelar.isPending;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <Link
        to="/campanas"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Campañas
      </Link>

      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">{campana.nombre}</h1>
            <CampaignStatusBadge estado={campana.estado} />
          </div>
          {campana.motivo ? (
            <p className="mt-1 text-sm text-muted-foreground">{campana.motivo}</p>
          ) : null}
          {campana.programadaPara ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Se enviará el {fechaHora(campana.programadaPara)}.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {campana.estado === 'borrador' ? (
            <Button
              disabled={ocupado}
              onClick={() => lanzar.mutate(campana.id)}
              className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
            >
              Enviar ahora
            </Button>
          ) : null}
          {enMarcha ? (
            <Button variant="outline" disabled={ocupado} onClick={() => pausar.mutate(campana.id)}>
              Pausar
            </Button>
          ) : null}
          {pausada ? (
            <Button disabled={ocupado} onClick={() => reanudar.mutate(campana.id)}>
              Reanudar
            </Button>
          ) : null}
          {cancelable ? (
            <Button
              variant="outline"
              disabled={ocupado}
              onClick={() => setConfirmarCancelar(true)}
            >
              Cancelar envío
            </Button>
          ) : null}
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card p-5">
        <CampaignProgress campana={campana} />
      </section>

      {campana.plantilla ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-foreground">Mensaje enviado</h2>
          <TemplatePreview cuerpo={campana.plantilla.cuerpo} ejemplos={campana.parametros} />
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">Destinatarios</h2>
          <div className="w-48">
            <Select
              value={estadoFiltro ?? TODOS}
              onValueChange={(v) =>
                setEstadoFiltro(v === TODOS ? undefined : (v as EstadoDestinatario))
              }
            >
              <SelectTrigger aria-label="Filtrar destinatarios por estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {ESTADOS_DESTINATARIO.map((e) => (
                  <SelectItem key={e} value={e}>
                    {ETIQUETA_DESTINATARIO[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teléfono</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Enviado</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(destinatarios?.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    {estadoFiltro
                      ? 'Ningún destinatario está en ese estado.'
                      : 'Esta campaña todavía no tiene destinatarios.'}
                  </TableCell>
                </TableRow>
              ) : (
                (destinatarios?.data ?? []).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="tabular-nums text-foreground">{d.telefono}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {ETIQUETA_DESTINATARIO[d.estado]}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.enviadoAt ? fechaHora(d.enviadoAt) : '—'}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground" title={d.error ?? ''}>
                      {d.error ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {destinatarios && destinatarios.total > destinatarios.data.length ? (
          <p className="text-sm text-muted-foreground">
            Se muestran los primeros {destinatarios.data.length} de {destinatarios.total}.
          </p>
        ) : null}
      </section>

      <AlertDialog open={confirmarCancelar} onOpenChange={setConfirmarCancelar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar «{campana.nombre}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Los mensajes que ya salieron no se pueden recuperar. Los que faltan por enviar se
              descartan y la campaña no se podrá reanudar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                cancelar.mutate(campana.id, { onSuccess: () => setConfirmarCancelar(false) })
              }
            >
              Cancelar envío
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
