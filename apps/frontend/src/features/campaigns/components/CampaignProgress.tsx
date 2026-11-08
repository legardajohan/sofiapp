import { Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cuandoAbre } from '@/features/send-window/lib/formato.js';

const zonaNavegador = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;
import { formatearNumero, porcentaje } from '../lib/pacing.js';
import type { CampaignDetalleDTO } from '../types.js';

/**
 * Avance de una campaña en curso.
 *
 * Lo que se mide es **cuánto queda por salir**, no cuánto se entregó: la entrega depende de que el
 * destinatario tenga el teléfono encendido y puede tardar horas, así que atarla a la barra la
 * dejaría clavada dando la sensación de que el envío se paró.
 */
export function CampaignProgress({ campana }: { campana: CampaignDetalleDTO }): React.ReactElement {
  const { totales, desglose } = campana;
  const procesados = totales.enviados + totales.fallidos + totales.omitidos;
  const avance = porcentaje(procesados, totales.destinatarios);

  return (
    <div className="space-y-4">
      {campana.estado === 'en_curso' && campana.retenidaHasta ? (
        // HU-CONF-01: la barra no se mueve porque el horario de envío está cerrado, no porque se
        // haya parado. Se dice para que nadie la pause y la reanude a mano.
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-secondary-foreground"
        >
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Esperando a que abra el horario de envío. Sigue sola {cuandoAbre(campana.retenidaHasta, zonaNavegador())}.
        </p>
      ) : null}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-sm text-foreground">
          <span className="font-semibold tabular-nums">{formatearNumero(procesados)}</span> de{' '}
          <span className="tabular-nums">{formatearNumero(totales.destinatarios)}</span> procesados
        </p>
        <p className="text-sm tabular-nums text-muted-foreground">{avance}%</p>
      </div>

      <Progress value={avance} aria-label={`Avance de la campaña: ${avance} por ciento`} />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
        {(
          [
            ['Pendientes', desglose.pendiente],
            ['Enviados', desglose.enviado],
            ['Entregados', desglose.entregado],
            ['Fallidos', desglose.fallido],
            ['Omitidos', desglose.omitido],
          ] as const
        ).map(([etiqueta, valor]) => (
          <div key={etiqueta}>
            <dt className="text-muted-foreground">{etiqueta}</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-foreground">
              {formatearNumero(valor)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
