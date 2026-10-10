import { Skeleton } from '@/components/ui/skeleton';
import { useCampaignMetrics } from '../hooks/useCampaigns.js';
import { esAnteriorALaMedicion, resultadosVivos } from '../lib/metricas.js';
import type { CampaignDetalleDTO } from '../types.js';
import { ActividadDiaria } from './ActividadDiaria.js';
import { MetricsFunnel } from './MetricsFunnel.js';

/** Ventana por defecto mientras no llega la respuesta: decide solo si hay que sondear. */
const CONVERSION_DIAS_DEFECTO = 14;

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Resultados de una campaña (HU-MARK-04): el embudo de envío a conversión.
 *
 * Va debajo del progreso y no lo sustituye: el progreso responde "¿cuánto falta por salir?" y esto
 * "¿qué hizo la gente con lo que salió?". Son preguntas de momentos distintos —la primera importa
 * durante el envío, la segunda en los días siguientes— y mezclarlas en una sola barra no contesta
 * bien ninguna.
 */
export function CampaignMetricsPanel({
  campana,
}: {
  campana: Pick<CampaignDetalleDTO, 'id' | 'estado' | 'iniciadaAt'>;
}): React.ReactElement {
  const { data, isPending, isError } = useCampaignMetrics(
    campana.id,
    resultadosVivos(campana, CONVERSION_DIAS_DEFECTO),
  );

  return (
    <section aria-labelledby="resultados-titulo" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="resultados-titulo" className="text-sm font-medium text-foreground">
          Resultados
        </h2>
        {data ? (
          <p className="text-xs text-muted-foreground">Actualizado a las {hora(data.calculadoAt)}</p>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
        {isPending ? (
          <div className="space-y-4 p-2" aria-busy="true" aria-label="Cargando resultados">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : isError || !data ? (
          <p className="px-2 py-6 text-sm text-muted-foreground">
            No se pudieron cargar los resultados. Recarga la página para intentarlo de nuevo.
          </p>
        ) : data.enviados === 0 ? (
          <p className="px-2 py-6 text-sm text-muted-foreground">
            Todavía no ha salido ningún mensaje. Los resultados aparecen aquí a medida que se envía.
          </p>
        ) : (
          <>
            <MetricsFunnel metricas={data} />

            {/* Un solo día no es una tendencia: la gráfica aparece desde el segundo. */}
            {data.serie.length > 1 ? (
              <div className="mt-4 border-t border-border px-2 pt-4">
                <ActividadDiaria serie={data.serie} />
              </div>
            ) : null}

            <div className="mt-3 space-y-1.5 border-t border-border px-2 pt-3 text-xs text-muted-foreground">
              {esAnteriorALaMedicion(campana) ? (
                <p>
                  Esta campaña salió antes de que SofiApp registrara lecturas, respuestas y ventas:
                  esas cifras empiezan en cero.
                </p>
              ) : null}
              <p className="max-w-prose">
                Una respuesta cuenta si llega en las {data.ventanas.respuestaHoras} horas
                siguientes al envío, y una venta en los {data.ventanas.conversionDias} días
                siguientes. Siempre se le atribuyen a la última campaña que recibió el contacto.
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
