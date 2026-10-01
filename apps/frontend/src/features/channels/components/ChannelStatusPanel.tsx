import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ETIQUETA_CALIDAD, etiquetaTier } from '../../campaigns/lib/pacing.js';
import type { IChannelStatusResponse } from '../api.js';
import { PRESS } from '../lib/press.js';

function Dato({ termino, children }: { termino: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-secondary-foreground">{termino}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

/**
 * El canal ya conectado, contado en lo que importa a quien lo administra: qué número es, si está
 * funcionando y cuánto puede enviar. Los IDs de Meta quedan al final y discretos, para soporte.
 */
export function ChannelStatusPanel({
  status,
  puedeReconectar,
  onReconectar,
  onActivar,
  activando,
}: {
  status: IChannelStatusResponse;
  puedeReconectar: boolean;
  onReconectar: () => void;
  onActivar: () => void;
  activando: boolean;
}): React.ReactElement {
  const titulo = status.displayPhoneNumber ?? 'Número de WhatsApp';

  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-semibold tabular-nums tracking-tight text-foreground">{titulo}</h2>
            {status.activo ? (
              <Badge variant="success">Conectado</Badge>
            ) : (
              <Badge variant="outline">Activación pendiente</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-secondary-foreground">
            {status.verifiedName ?? 'El nombre verificado aparecerá cuando Meta lo confirme.'}
          </p>
        </div>
        {puedeReconectar && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className={`${PRESS} shrink-0`}>
                Cambiar número
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Cambiar el número de WhatsApp?</AlertDialogTitle>
                <AlertDialogDescription>
                  {titulo} dejará de recibir mensajes en cuanto elijas el nuevo número, hasta que
                  termines de activarlo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                {/* Síncrono a propósito: el popup de Meta tiene que abrirse dentro de este clic. */}
                <AlertDialogAction onClick={onReconectar}>Cambiar número</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {!status.activo && (
        <div className="mx-6 mb-6 flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4 sm:mx-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-sm text-foreground">
              Falta terminar de activar el número. Hasta entonces no llegan mensajes a la bandeja.
            </p>
          </div>
          <Button size="sm" onClick={onActivar} disabled={activando} className={`${PRESS} shrink-0`}>
            {activando && <Loader2 className="motion-safe:animate-spin" />}
            {activando ? 'Activando…' : 'Terminar activación'}
          </Button>
        </div>
      )}

      <dl className="grid gap-5 border-t border-border p-6 sm:grid-cols-2 sm:p-8">
        <Dato termino="Capacidad de envío">
          {etiquetaTier(status.messagingTier)}
          <span className="block text-sm font-normal text-secondary-foreground">
            Contactos nuevos que puedes iniciar por día, según Meta.
          </span>
        </Dato>
        <Dato termino="Calidad del número">
          {ETIQUETA_CALIDAD[status.qualityRating]}
          <span className="block text-sm font-normal text-secondary-foreground">
            Baja si muchos contactos bloquean o reportan tus mensajes.
          </span>
        </Dato>
      </dl>

      <p className="border-t border-border px-6 py-3 font-mono text-xs text-secondary-foreground sm:px-8">
        Phone Number ID {status.phoneNumberId} · WABA {status.wabaId}
      </p>
    </section>
  );
}
