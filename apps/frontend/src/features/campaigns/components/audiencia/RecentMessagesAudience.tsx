import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAjustesTenant } from '@/features/tenant-settings/hooks/useAjustesTenant';
import { ZonaHorariaDialog } from '@/features/tenant-settings/ZonaHorariaDialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import {
  ETIQUETA_RANGO,
  formatearRangoResuelto,
  type SeleccionRango,
} from '../../lib/rango.js';
import { RANGOS_AUDIENCIA, type AudiencePreviewDTO, type RangoAudiencia } from '../../types.js';
import { resumenDe } from '../../lib/resumen.js';
import { ConteoAudiencia } from './ConteoAudiencia.js';
import { DateRangePicker } from './DateRangePicker.js';

interface Props {
  valor: SeleccionRango;
  onChange: (seleccion: SeleccionRango) => void;
  preview: AudiencePreviewDTO | undefined;
  cargando: boolean;
  actualizando: boolean;
}

/**
 * «¿A quién le escribes?» cuando la respuesta es «a quienes les escribimos hace poco» (HU-MARK-07).
 *
 * Misma disposición que el constructor por filtros —a la izquierda se decide, a la derecha se
 * comprueba— para que cambiar de tipo de audiencia no obligue a reaprender la pantalla. A la derecha
 * va también el rango **tal como lo resolvió el servidor**, en la zona de la empresa: «últimos 3
 * días» deja de ser una frase y pasa a ser dos fechas con hora que se pueden comprobar.
 */
export function RecentMessagesAudience({
  valor,
  onChange,
  preview,
  cargando,
  actualizando,
}: Props): React.ReactElement {
  const idFechas = useId();
  const [cambiandoZona, setCambiandoZona] = useState(false);
  const ajustes = useAjustesTenant();
  const zona = ajustes.data?.zonaHoraria ?? preview?.rango.zonaHoraria ?? null;
  const esCustom = valor.rango === 'custom';
  const incompleto = esCustom && !(valor.desde && valor.hasta);
  const resumen = preview && !incompleto ? resumenDe(preview) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="min-w-0 space-y-6">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Periodo</h3>
          <p className="text-sm text-muted-foreground">
            Contactos a los que tu equipo, Sofi o una campaña les envió al menos un mensaje en ese
            tiempo. Cada uno recibe la campaña una sola vez.
          </p>
          <ToggleGroup
            type="single"
            value={valor.rango}
            onValueChange={(v) => {
              if (v) onChange({ ...valor, rango: v as RangoAudiencia });
            }}
            aria-label="Periodo de los mensajes"
            className="flex flex-wrap justify-start gap-2 pt-1"
          >
            {RANGOS_AUDIENCIA.map((r) => (
              <ToggleGroupItem
                key={r}
                value={r}
                variant="outline"
                className="h-9 rounded-full px-4 text-sm transition-transform duration-150 ease-out data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-foreground motion-safe:active:scale-[0.97]"
              >
                {ETIQUETA_RANGO[r]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {esCustom ? (
          <div className="space-y-1.5">
            <Label htmlFor={idFechas}>Fechas</Label>
            <DateRangePicker
              id={idFechas}
              valor={valor.desde ? { from: valor.desde, to: valor.hasta } : undefined}
              onChange={(r) => onChange({ ...valor, desde: r?.from, hasta: r?.to })}
            />
          </div>
        ) : null}

        {zona ? (
          <p className="text-xs text-muted-foreground">
            Los días se cuentan en <span className="text-foreground">{zona.replace(/_/g, ' ')}</span>.{' '}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => setCambiandoZona(true)}
            >
              Cambiar
            </Button>
          </p>
        ) : null}
        {zona ? (
          <ZonaHorariaDialog open={cambiandoZona} onOpenChange={setCambiandoZona} actual={zona} />
        ) : null}
      </div>

      <section
        aria-label="Audiencia de la campaña"
        className="flex flex-col gap-5 rounded-xl border border-border bg-muted/30 p-4 sm:p-5 lg:sticky lg:top-0"
      >
        {incompleto ? (
          <p className="text-sm text-muted-foreground">
            Elige la fecha de inicio y la de fin para ver a cuántas personas les llega.
          </p>
        ) : (
          <>
            <ConteoAudiencia
              resumen={resumen}
              cargando={cargando}
              actualizando={actualizando}
              coincidenTexto="recibieron mensajes en el periodo"
              vacio="Nadie recibió mensajes en ese periodo. Prueba con uno más amplio."
              ocultar={['excluidosAMano']}
            />

            {preview && resumen ? (
              <p
                className={cn(
                  'text-xs tabular-nums text-muted-foreground transition-opacity duration-200 ease-out',
                  actualizando && 'opacity-60',
                )}
              >
                {formatearRangoResuelto(preview.rango.desde, preview.rango.hasta, preview.rango.zonaHoraria)}{' '}
                ({preview.rango.zonaHoraria})
              </p>
            ) : null}

            {preview && preview.muestra.length > 0 ? (
              <div className="space-y-2 border-t border-border pt-4">
                <h3 className="text-sm font-semibold text-foreground">Algunos de ellos</h3>
                <ul className="-mx-1 space-y-0.5">
                  {preview.muestra.map((c) => (
                    <li key={c.id} className="rounded-md px-1 py-1.5 text-sm">
                      <span className="block truncate text-foreground">{c.nombre ?? 'Sin nombre'}</span>
                      <span className="block truncate text-xs tabular-nums text-muted-foreground">
                        {c.telefono}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
