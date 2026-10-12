import { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatearNumero } from '../../lib/pacing.js';
import type { OpcionSegmento } from '../../lib/segmento.js';

interface Props {
  titulo: string;
  descripcion: string;
  opciones: OpcionSegmento[];
  seleccion: string[];
  onChange: (keys: string[]) => void;
  /**
   * Contactos alcanzables por clave. `undefined` mientras cargan: no es lo mismo que cero.
   * `null` = este catálogo no tiene conteo (refinamientos): no se pinta la columna del número.
   */
  conteos: Record<string, number> | undefined | null;
  cargando: boolean;
  vacio: string;
}

/** Con más opciones que esto aparece el buscador: por debajo, se leen todas de un vistazo. */
const UMBRAL_BUSQUEDA = 8;

/**
 * Un catálogo seleccionable (etapas o etiquetas) como rejilla de casillas grandes.
 *
 * Tarjetas y no un desplegable porque aquí está la decisión principal del paso: el usuario arma la
 * audiencia **comparando** cuánta gente hay en cada opción, y eso pide verlas todas a la vez con
 * su número al lado. Las opciones sin nadie alcanzable se atenúan pero siguen elegibles: el conteo
 * es de ahora, y una campaña programada se evalúa a la hora del envío.
 */
export function CriterioGrupo({
  titulo,
  descripcion,
  opciones,
  seleccion,
  onChange,
  conteos,
  cargando,
  vacio,
}: Props): React.ReactElement {
  const idTitulo = useId();
  const [busqueda, setBusqueda] = useState('');

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es');
    return q ? opciones.filter((o) => o.label.toLocaleLowerCase('es').includes(q)) : opciones;
  }, [busqueda, opciones]);

  function alternar(key: string): void {
    onChange(seleccion.includes(key) ? seleccion.filter((k) => k !== key) : [...seleccion, key]);
  }

  const todasVisiblesElegidas =
    visibles.length > 0 && visibles.every((o) => seleccion.includes(o.key));

  function alternarVisibles(): void {
    const claves = visibles.map((o) => o.key);
    onChange(
      todasVisiblesElegidas
        ? seleccion.filter((k) => !claves.includes(k))
        : [...new Set([...seleccion, ...claves])],
    );
  }

  return (
    <section aria-labelledby={idTitulo} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 id={idTitulo} className="text-sm font-semibold text-foreground">
            {titulo}
            {seleccion.length > 0 ? (
              <span className="ml-2 font-normal tabular-nums text-muted-foreground">
                {seleccion.length} de {opciones.length}
              </span>
            ) : null}
          </h3>
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        </div>
        {visibles.length > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={alternarVisibles}
            className="h-8 px-2 text-muted-foreground transition-transform duration-150 ease-out hover:text-foreground motion-safe:active:scale-[0.97]"
          >
            {todasVisiblesElegidas ? 'Quitar todas' : 'Elegir todas'}
          </Button>
        ) : null}
      </div>

      {opciones.length > UMBRAL_BUSQUEDA ? (
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={`Buscar en ${titulo.toLocaleLowerCase('es')}`}
            aria-label={`Buscar en ${titulo.toLocaleLowerCase('es')}`}
            className="h-9 pl-9"
          />
        </div>
      ) : null}

      {cargando ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : opciones.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          {vacio}
        </p>
      ) : visibles.length === 0 ? (
        <p className="px-1 py-3 text-sm text-muted-foreground">
          Nada coincide con «{busqueda.trim()}».
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {visibles.map((o) => {
            const elegida = seleccion.includes(o.key);
            const sinConteo = conteos === null;
            const conteo = conteos?.[o.key] ?? (conteos ? 0 : undefined);
            return (
              <li key={o.key}>
                <label
                  className={cn(
                    'group flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm',
                    'transition-[border-color,background-color,transform] duration-150 ease-out motion-safe:active:scale-[0.98]',
                    'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
                    elegida
                      ? 'border-primary bg-primary/5 dark:bg-primary/10'
                      : 'border-border bg-card hover:border-foreground/25',
                  )}
                >
                  <Checkbox checked={elegida} onCheckedChange={() => alternar(o.key)} />
                  {o.color ? (
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                      style={{ backgroundColor: o.color }}
                    />
                  ) : null}
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      conteo === 0 && !elegida ? 'text-muted-foreground' : 'text-foreground',
                    )}
                  >
                    {o.label}
                  </span>
                  {sinConteo ? null : (
                    <span
                      className={cn(
                        'shrink-0 tabular-nums',
                        elegida ? 'font-medium text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {conteo === undefined ? (
                        // `span` y no `Skeleton` (un `div`): va dentro de un `label`.
                        <span
                          aria-hidden
                          className="inline-block h-4 w-6 animate-pulse rounded-md bg-muted"
                        />
                      ) : (
                        <>
                          {formatearNumero(conteo)}
                          <span className="sr-only">
                            {' '}
                            {conteo === 1 ? 'contacto' : 'contactos'}
                          </span>
                        </>
                      )}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
