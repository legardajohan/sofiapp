import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatearNumero } from '../../lib/pacing.js';
import type { ResumenCompleto } from '../../lib/resumen.js';

type ClaveTramo = keyof Omit<ResumenCompleto, 'coinciden'>;

/** Tramos de la barra, de lo que se envía a lo que se cae. El orden es el de la lectura. */
const TRAMOS: Array<{ clave: ClaveTramo; etiqueta: string; clase: string }> = [
  { clave: 'validos', etiqueta: 'Recibirán el mensaje', clase: 'bg-primary' },
  { clave: 'duplicados', etiqueta: 'Teléfono repetido', clase: 'bg-muted-foreground/55' },
  { clave: 'excluidosAMano', etiqueta: 'Quitados por ti', clase: 'bg-destructive/70' },
  { clave: 'bajas', etiqueta: 'Pidieron no recibir mensajes', clase: 'bg-muted-foreground/25' },
  { clave: 'bloqueados', etiqueta: 'Bloqueados o inactivos', clase: 'bg-muted-foreground/40' },
];

interface Props {
  resumen: ResumenCompleto | null;
  cargando: boolean;
  actualizando: boolean;
  /** Cómo se dice "los que coinciden" en esta audiencia: «cumplen los criterios», «recibieron…». */
  coincidenTexto: string;
  /** Lo que se dice cuando nadie coincide: depende de qué se pueda cambiar para arreglarlo. */
  vacio: string;
  /** Tramos que no aplican a esta audiencia y no se listan (p. ej. «Quitados por ti»). */
  ocultar?: ClaveTramo[];
  /** Acciones bajo el desglose (p. ej. «Devolver a los que quitaste»). */
  children?: React.ReactNode;
}

/**
 * La cifra grande y por qué no es más grande. Compartida por las dos audiencias —por filtros y por
 * mensajes recientes (HU-MARK-07)— para que «quién recibe» se lea igual venga de donde venga.
 *
 * La barra no se anima: cambia con cada criterio y una transición ahí se vuelve espera. Lo que sí se
 * ve es que el número está recalculando (baja de opacidad) para que nadie confíe en una cifra vieja.
 */
export function ConteoAudiencia({
  resumen,
  cargando,
  actualizando,
  coincidenTexto,
  vacio,
  ocultar = [],
  children,
}: Props): React.ReactElement {
  const caidos = resumen ? resumen.coinciden - resumen.validos : 0;
  const tramos = TRAMOS.filter((t) => !ocultar.includes(t.clave));

  return (
    <>
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
                  <>
                    {' '}
                    de {formatearNumero(resumen.coinciden)} que {coincidenTexto}
                  </>
                ) : null}
              </span>
            </p>
          </div>
        )}
      </div>

      {resumen && resumen.coinciden > 0 ? (
        <div
          className={cn(
            'space-y-3 transition-opacity duration-200 ease-out',
            actualizando && 'opacity-60',
          )}
        >
          <div
            role="img"
            aria-label={tramos
              .map((t) => `${t.etiqueta}: ${formatearNumero(resumen[t.clave])}`)
              .join('. ')}
            className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
          >
            {tramos
              .filter((t) => resumen[t.clave] > 0)
              .map((t) => (
                <span
                  key={t.clave}
                  className={cn('h-full first:rounded-l-full last:rounded-r-full', t.clase)}
                  style={{ width: `${(resumen[t.clave] / resumen.coinciden) * 100}%` }}
                />
              ))}
          </div>

          {/* La leyenda solo explica lo que se cae: lo que se envía ya es la cifra grande. */}
          <dl className="space-y-1.5 text-sm">
            {tramos
              .filter((t) => t.clave !== 'validos')
              .map((t) => (
                <div key={t.clave} className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', t.clase)} />
                    {t.etiqueta}
                  </dt>
                  <dd
                    className={cn(
                      'tabular-nums',
                      resumen[t.clave] > 0
                        ? 'font-medium text-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    {formatearNumero(resumen[t.clave])}
                  </dd>
                </div>
              ))}
          </dl>

          {children}
        </div>
      ) : resumen ? (
        <p className="text-sm text-muted-foreground">{vacio}</p>
      ) : null}
    </>
  );
}
