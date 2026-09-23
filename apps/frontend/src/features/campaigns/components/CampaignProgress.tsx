import { Progress } from '@/components/ui/progress';
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
