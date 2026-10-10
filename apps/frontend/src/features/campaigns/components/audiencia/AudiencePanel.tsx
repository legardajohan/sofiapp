import { useEffect, useId, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/lib/utils';
import { useAudiencia } from '../../hooks/useCampaigns.js';
import { formatearNumero } from '../../lib/pacing.js';
import { alternarExclusion, devolverExcluidos, sinExclusiones } from '../../lib/segmento.js';
import {
  MAX_EXCLUSIONES,
  type ResumenSegmentoDTO,
  type SegmentPreviewDTO,
  type SegmentoFiltros,
} from '../../types.js';

interface Props {
  filtros: SegmentoFiltros;
  onChange: (filtros: SegmentoFiltros) => void;
  preview: SegmentPreviewDTO | undefined;
  /** Primera carga: todavía no hay ningún número que enseñar. */
  cargando: boolean;
  /** Recalculando tras un cambio: hay número, pero puede estar viejo. */
  actualizando: boolean;
  enabled: boolean;
}

/** Tramos de la barra, de lo que se envía a lo que se cae. El orden es el de la lectura. */
const TRAMOS: Array<{
  clave: keyof Omit<ResumenSegmentoDTO, 'coinciden'>;
  etiqueta: string;
  clase: string;
}> = [
  { clave: 'validos', etiqueta: 'Recibirán el mensaje', clase: 'bg-primary' },
  { clave: 'duplicados', etiqueta: 'Teléfono repetido', clase: 'bg-muted-foreground/55' },
  { clave: 'excluidosAMano', etiqueta: 'Quitados por ti', clase: 'bg-destructive/70' },
  { clave: 'bajas', etiqueta: 'Pidieron no recibir mensajes', clase: 'bg-muted-foreground/25' },
];

/** El backend anterior al constructor no manda resumen: se reconstruye lo que se sabe. */
function resumenDe(preview: SegmentPreviewDTO): ResumenSegmentoDTO {
  return (
    preview.resumen ?? {
      coinciden: preview.total,
      bajas: 0,
      excluidosAMano: 0,
      duplicados: 0,
      validos: preview.total,
    }
  );
}

/**
 * La audiencia en vivo: cuántos reciben el mensaje, por qué se cae el resto, y quiénes son.
 *
 * Es la pieza que da confianza para pulsar «Enviar». Un número suelto no dice si los filtros
 * apuntan a quien el usuario cree; la descomposición explica la diferencia entre «coinciden» y
 * «recibirán» (bajas, repetidos, quitados a mano), y la lista deja comprobarlo nombre a nombre y
 * sacar a quien sobre sin tener que inventar otro filtro.
 *
 * La barra no se anima: cambia cada vez que se toca un criterio, y una transición ahí se vuelve
 * espera. Lo que sí se ve es que el número está recalculando (baja de opacidad) para que nadie
 * confíe en una cifra vieja.
 */
export function AudiencePanel({
  filtros,
  onChange,
  preview,
  cargando,
  actualizando,
  enabled,
}: Props): React.ReactElement {
  const idLista = useId();
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage] = useState(1);
  const busquedaDebounced = useDebouncedValue(busqueda.trim(), 300);
  // Se retrasa una CLAVE de texto y no el objeto: `sinExclusiones` crea uno nuevo en cada render, y
  // un objeto nuevo reiniciaría el temporizador sin fin. Quitar a alguien tampoco la cambia, así que
  // ni se vuelve a pedir la lista ni se salta a la primera página.
  const claveLista = useDebouncedValue(JSON.stringify(sinExclusiones(filtros)), 400);
  const filtrosLista = useMemo(() => JSON.parse(claveLista) as SegmentoFiltros, [claveLista]);

  // Otra búsqueda u otros criterios: la página 3 de la consulta anterior no existe en la nueva.
  useEffect(() => setPage(1), [busquedaDebounced, claveLista]);

  const lista = useAudiencia(filtrosLista, busquedaDebounced, page, enabled);
  const excluidos = new Set(filtros.excluirClienteIds ?? []);
  const topeAlcanzado = excluidos.size >= MAX_EXCLUSIONES;

  const resumen = preview ? resumenDe(preview) : null;
  const caidos = resumen ? resumen.coinciden - resumen.validos : 0;

  const totalLista = lista.data?.total ?? 0;
  const desde = totalLista === 0 ? 0 : (page - 1) * 20 + 1;
  const hasta = Math.min(page * 20, totalLista);

  return (
    <section
      aria-label="Audiencia de la campaña"
      className="flex flex-col gap-5 rounded-xl border border-border bg-muted/30 p-4 sm:p-5"
    >
      {/* ── Cifra principal ───────────────────────────────────────────── */}
      <div aria-live="polite" aria-busy={actualizando}>
        {cargando || !resumen ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-4 w-44" />
          </div>
        ) : (
          <div
            className={cn('transition-opacity duration-200 ease-out', actualizando && 'opacity-60')}
          >
            <p className="text-4xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
              {formatearNumero(resumen.validos)}
            </p>
            <p className="mt-1.5 flex items-baseline gap-2 text-sm text-muted-foreground">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full bg-primary"
              />
              <span>
                {resumen.validos === 1 ? 'persona recibirá' : 'personas recibirán'} el mensaje
                {caidos > 0 ? (
                  <> de {formatearNumero(resumen.coinciden)} que cumplen los criterios</>
                ) : null}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* ── Descomposición ────────────────────────────────────────────── */}
      {resumen && resumen.coinciden > 0 ? (
        <div
          className={cn(
            'space-y-3 transition-opacity duration-200 ease-out',
            actualizando && 'opacity-60',
          )}
        >
          <div
            role="img"
            aria-label={TRAMOS.map(
              (t) => `${t.etiqueta}: ${formatearNumero(resumen[t.clave])}`,
            ).join('. ')}
            className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
          >
            {TRAMOS.filter((t) => resumen[t.clave] > 0).map((t) => (
              <span
                key={t.clave}
                className={cn('h-full first:rounded-l-full last:rounded-r-full', t.clase)}
                style={{ width: `${(resumen[t.clave] / resumen.coinciden) * 100}%` }}
              />
            ))}
          </div>

          {/* La leyenda solo explica lo que se cae: lo que se envía ya es la cifra grande. */}
          <dl className="space-y-1.5 text-sm">
            {TRAMOS.filter((t) => t.clave !== 'validos').map((t) => (
              <div key={t.clave} className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', t.clase)} />
                  {t.etiqueta}
                </dt>
                <dd
                  className={cn(
                    'tabular-nums',
                    resumen[t.clave] > 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {formatearNumero(resumen[t.clave])}
                </dd>
              </div>
            ))}
          </dl>

          {resumen.excluidosAMano > 0 || excluidos.size > 0 ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-sm"
              onClick={() => onChange(devolverExcluidos(filtros))}
            >
              Devolver a los {formatearNumero(excluidos.size)} que quitaste
            </Button>
          ) : null}
        </div>
      ) : resumen ? (
        <p className="text-sm text-muted-foreground">
          Nadie cumple estos criterios. Quita alguno, o elige «Cumplen cualquiera» si combinas
          etapas y etiquetas.
        </p>
      ) : null}

      {/* ── Quiénes son ───────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-col gap-3 border-t border-border pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={idLista} className="text-sm font-semibold text-foreground">
            Revisa la lista
          </h3>
          {totalLista > 0 ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatearNumero(desde)}–{formatearNumero(hasta)} de {formatearNumero(totalLista)}
            </span>
          ) : null}
        </div>

        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o teléfono"
            aria-label="Buscar contacto en la audiencia"
            className="h-9 bg-background pl-9"
          />
        </div>

        {lista.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : totalLista === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {busquedaDebounced
              ? `Nadie de esta audiencia coincide con «${busquedaDebounced}».`
              : 'Aún no hay a quién mostrar.'}
          </p>
        ) : (
          <ul
            aria-labelledby={idLista}
            className={cn(
              '-mx-1 max-h-72 space-y-0.5 overflow-y-auto transition-opacity duration-200 ease-out',
              lista.isFetching && 'opacity-60',
            )}
          >
            {lista.data?.data.map((c) => {
              const excluido = excluidos.has(c.id);
              const bloqueado = !excluido && topeAlcanzado;
              return (
                <li key={c.id}>
                  <label
                    className={cn(
                      'flex items-center gap-3 rounded-md px-2 py-2 text-sm',
                      bloqueado ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-background',
                    )}
                  >
                    <Checkbox
                      checked={!excluido}
                      disabled={bloqueado}
                      onCheckedChange={() => onChange(alternarExclusion(filtros, c.id))}
                      aria-label={`${excluido ? 'Incluir' : 'Quitar'} a ${c.nombre ?? c.telefono}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate',
                          excluido ? 'text-muted-foreground line-through' : 'text-foreground',
                        )}
                      >
                        {c.nombre ?? 'Sin nombre'}
                      </span>
                      <span className="block truncate text-xs tabular-nums text-muted-foreground">
                        {c.telefono}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {totalLista > 20 ? (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={hasta >= totalLista}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}

        {topeAlcanzado ? (
          <p className="text-xs text-muted-foreground">
            Llegaste al máximo de {formatearNumero(MAX_EXCLUSIONES)} personas quitadas a mano. Si
            necesitas sacar a más, ajusta los criterios.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Desmarca a quien no deba recibir esta campaña. No se borra nada de su ficha.
          </p>
        )}
      </div>
    </section>
  );
}
