import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatearNumero } from '../lib/pacing.js';
import { formatearTasa } from '../lib/metricas.js';
import type { MetricasCampana } from '../types.js';

interface Paso {
  clave: string;
  etiqueta: string;
  valor: number;
  /** Lo que se lee bajo la cifra: la tasa y contra qué se calcula. */
  detalle: string;
  /** Qué cuenta exactamente este paso. Va en el tooltip: la cifra sola no lo explica. */
  ayuda: string;
}

function pasos(m: MetricasCampana): Paso[] {
  return [
    {
      clave: 'enviados',
      etiqueta: 'Enviados',
      valor: m.enviados,
      detalle:
        m.fallidos > 0
          ? `${formatearNumero(m.fallidos)} no se pudieron enviar`
          : `de ${formatearNumero(m.destinatarios)} en el segmento`,
      ayuda: 'Mensajes que WhatsApp aceptó y no rechazó después.',
    },
    {
      clave: 'entregados',
      etiqueta: 'Entregados',
      valor: m.entregados,
      detalle: `${formatearTasa(m.tasas.entrega)} de los enviados`,
      ayuda: 'Llegaron al teléfono del contacto.',
    },
    {
      clave: 'abiertos',
      etiqueta: 'Abiertos',
      valor: m.leidos,
      detalle: `al menos ${formatearTasa(m.tasas.apertura)} de los entregados`,
      ayuda:
        'El contacto los leyó. Es una cifra mínima: WhatsApp no avisa cuando alguien desactiva las confirmaciones de lectura.',
    },
    {
      clave: 'respondidos',
      etiqueta: 'Respondieron',
      valor: m.respondidos,
      detalle: `${formatearTasa(m.tasas.respuesta)} de los entregados`,
      ayuda: 'El contacto escribió después de recibir esta campaña y antes de recibir otra.',
    },
    {
      clave: 'convertidos',
      etiqueta: 'Convirtieron',
      valor: m.convertidos,
      detalle: `${formatearTasa(m.tasas.conversion)} de los entregados`,
      ayuda: 'Su lead pasó a una etapa marcada como venta en Etapas.',
    },
  ];
}

/**
 * Embudo de una campaña: cuántos llegaron a cada paso, de enviar a convertir.
 *
 * **Una sola serie, un solo color.** Los cinco pasos miden lo mismo —personas— sobre la misma
 * escala, así que el color no codifica identidad y no hace falta leyenda: lo dice la etiqueta. La
 * barra es proporcional a los **enviados** para que el estrechamiento se lea de un vistazo; la tasa
 * va en texto, con su denominador, porque un porcentaje sin "de qué" no se puede comparar.
 *
 * La barra crece con `scaleX` y no con `width`: no dispara layout, y al refrescarse cada 30 s se
 * re-dirige desde donde estaba en vez de saltar.
 */
export function MetricsFunnel({ metricas }: { metricas: MetricasCampana }): React.ReactElement {
  const base = Math.max(metricas.enviados, 1);

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={400}>
      <ol className="space-y-1" aria-label="Resultados de la campaña por paso">
        {pasos(metricas).map((paso) => {
          // Un valor real nunca se pinta como barra vacía: 3 de 10.000 sigue siendo algo.
          const fraccion = paso.valor === 0 ? 0 : Math.max(paso.valor / base, 0.01);

          return (
            <li key={paso.clave}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 rounded-md px-2 py-2 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[7.5rem_minmax(0,1fr)_13rem] [@media(hover:hover)]:hover:bg-muted/50"
                  >
                    <span className="text-sm text-muted-foreground">{paso.etiqueta}</span>

                    <div className="h-2.5 overflow-hidden rounded-[4px] bg-muted" aria-hidden>
                      <div
                        className="h-full origin-left rounded-[4px] bg-primary transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
                        style={{ transform: `scaleX(${fraccion})` }}
                      />
                    </div>

                    <p className="col-start-2 flex flex-wrap items-baseline gap-x-2 sm:col-start-3 sm:justify-end sm:text-right">
                      <span className="text-base font-semibold tabular-nums text-foreground">
                        {formatearNumero(paso.valor)}
                      </span>
                      <span className="text-xs text-muted-foreground">{paso.detalle}</span>
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="start" className="max-w-xs">
                  {paso.ayuda}
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ol>
    </TooltipProvider>
  );
}
