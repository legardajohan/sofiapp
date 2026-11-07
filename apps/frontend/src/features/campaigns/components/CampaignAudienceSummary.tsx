import { Link } from 'react-router-dom';
import { TagChip } from '@/features/tags/components/TagChip';
import { describirAudiencia, formatearRangoResuelto } from '../lib/rango.js';
import type { CampaignDTO } from '../types.js';

interface Props {
  campana: CampaignDTO;
}

/**
 * El filtro con el que se armó la audiencia y la etiqueta que se puso a los destinatarios
 * (HU-MARK-07). Es la trazabilidad de la campaña: meses después se puede responder «¿a quién se le
 * escribió y por qué?» con las fechas exactas que se usaron, no con «últimos 3 días» de cuándo.
 *
 * La etiqueta enlaza a Leads ya filtrado por ella: es para lo que existe.
 */
export function CampaignAudienceSummary({ campana }: Props): React.ReactElement | null {
  const audiencia = campana.audiencia;
  const etiqueta = campana.etiqueta ?? null;
  if (!audiencia && !etiqueta) return null;

  const rango =
    audiencia?.tipo === 'mensajes_recientes' && audiencia.desde && audiencia.hasta
      ? formatearRangoResuelto(audiencia.desde, audiencia.hasta, audiencia.zonaHoraria ?? 'UTC')
      : null;

  return (
    <dl className="grid gap-x-8 gap-y-4 rounded-lg border border-border bg-card p-5 text-sm sm:grid-cols-2">
      {audiencia ? (
        <div className="min-w-0 space-y-1">
          <dt className="text-muted-foreground">Audiencia</dt>
          <dd className="text-foreground">{describirAudiencia(audiencia)}</dd>
          {rango ? (
            <dd className="text-xs tabular-nums text-muted-foreground">
              {rango} ({audiencia.zonaHoraria})
            </dd>
          ) : null}
        </div>
      ) : null}

      <div className="min-w-0 space-y-1">
        <dt className="text-muted-foreground">Etiqueta para los destinatarios</dt>
        <dd>
          {etiqueta ? (
            <Link
              to={`/leads?etiqueta=${etiqueta.id}`}
              className="inline-flex max-w-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={`Ver los leads con la etiqueta ${etiqueta.nombre}`}
            >
              <TagChip tag={{ ...etiqueta, semaforo: null }} className="max-w-full" />
            </Link>
          ) : (
            <span className="text-muted-foreground">Sin etiqueta</span>
          )}
        </dd>
        {etiqueta ? (
          <dd className="text-xs text-muted-foreground">
            Solo la reciben los envíos que salieron bien.
          </dd>
        ) : null}
      </div>
    </dl>
  );
}
