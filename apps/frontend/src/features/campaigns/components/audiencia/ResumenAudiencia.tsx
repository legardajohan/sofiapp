import { useCatalogosSegmento } from '../../hooks/useCatalogosSegmento.js';
import { formatearNumero } from '../../lib/pacing.js';
import { criteriosAplicados } from '../../lib/segmento.js';
import { CriteriosAplicados } from './CriteriosAplicados.js';
import type { SegmentPreviewDTO, SegmentoFiltros } from '../../types.js';

interface Props {
  filtros: SegmentoFiltros;
  preview: SegmentPreviewDTO | undefined;
}

/**
 * Lo que se decidió en el primer paso, repetido en la revisión: a quién va y cuánta gente se quedó
 * fuera. Es la última oportunidad de notar un criterio equivocado antes de gastar cupo, así que se
 * enseñan los criterios con sus nombres, no solo el número.
 */
export function ResumenAudiencia({ filtros, preview }: Props): React.ReactElement {
  const { catalogos } = useCatalogosSegmento();
  const criterios = criteriosAplicados(filtros, catalogos);
  const resumen = preview?.resumen;
  const fuera = resumen ? resumen.coinciden - resumen.validos : 0;

  return (
    <section
      aria-label="Audiencia"
      className="space-y-3 rounded-lg border border-border bg-muted/30 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold text-foreground">A quién va</h3>
        {resumen && fuera > 0 ? (
          <p className="text-sm text-muted-foreground">
            <span className="tabular-nums">{formatearNumero(fuera)}</span> se quedan fuera
            {resumen.bajas > 0 ? (
              <>
                , <span className="tabular-nums">{formatearNumero(resumen.bajas)}</span> por haber
                pedido no recibir mensajes
              </>
            ) : null}
            .
          </p>
        ) : null}
      </div>
      <CriteriosAplicados criterios={criterios} combinacion={filtros.combinacion ?? 'y'} />
      {filtros.excluirClienteIds?.length ? (
        <p className="text-sm text-muted-foreground">
          Quitaste a mano a{' '}
          <span className="tabular-nums">{formatearNumero(filtros.excluirClienteIds.length)}</span>{' '}
          {filtros.excluirClienteIds.length === 1 ? 'persona' : 'personas'}.
        </p>
      ) : null}
    </section>
  );
}
