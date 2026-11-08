import { CopyCheck, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { aMinutos } from '../lib/politica.js';
import {
  cruzaMedianoche,
  errorDeFranja,
  esHoraFin,
  esHoraInicio,
  type FranjasPorDia,
} from '../lib/validacion.js';
import { NOMBRE_DIA, ORDEN_DIAS, type FranjaDia } from '../types.js';

interface Props {
  /** Prefijo para los `id` de los campos: hace únicos los de cada categoría. */
  idBase: string;
  dias: FranjasPorDia;
  onChange: (dias: FranjasPorDia) => void;
}

const MIN_DIA = 1440;

/** Franja nueva: empieza donde acabó la última del día, o a las 08:00 en un día vacío. */
function franjaNueva(existentes: FranjaDia[]): FranjaDia {
  const ultima = existentes[existentes.length - 1];
  if (!ultima || !esHoraFin(ultima.hasta) || ultima.hasta === '24:00') {
    return { desde: '08:00', hasta: '19:00' };
  }
  const inicio = aMinutos(ultima.hasta);
  const fin = Math.min(inicio + 120, MIN_DIA);
  const hhmm = (m: number): string =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { desde: hhmm(inicio), hasta: hhmm(fin) };
}

interface Segmento {
  ini: number;
  fin: number;
  /** Viene de una franja del día anterior que cruzó la medianoche. */
  cola: boolean;
}

/** Tramos que pinta la pista de un día: los suyos más la cola nocturna del anterior. */
function segmentosDelDia(dia: number, dias: FranjasPorDia): Segmento[] {
  const propios = (dias[dia] ?? [])
    .filter((f) => esHoraInicio(f.desde) && esHoraFin(f.hasta) && f.desde !== f.hasta)
    .map((f): Segmento => {
      const ini = aMinutos(f.desde);
      const fin = aMinutos(f.hasta);
      return { ini, fin: fin > ini ? fin : MIN_DIA, cola: false };
    });
  const anterior = (dia + 6) % 7;
  const colas = (dias[anterior] ?? [])
    .filter(cruzaMedianoche)
    .map((f): Segmento => ({ ini: 0, fin: aMinutos(f.hasta), cola: true }));
  return [...colas, ...propios];
}

/** Pista de 24 h de un día. Decorativa: el texto de la fila ya dice lo mismo. */
function PistaDia({ segmentos }: { segmentos: Segmento[] }): React.ReactElement {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      {segmentos.map((s, i) => (
        <span
          key={i}
          className={cn(
            'absolute inset-y-0 rounded-full transition-[left,width] duration-200 ease-out motion-reduce:transition-none',
            s.cola ? 'bg-primary/40' : 'bg-primary',
          )}
          style={{ left: `${(s.ini / MIN_DIA) * 100}%`, width: `${((s.fin - s.ini) / MIN_DIA) * 100}%` }}
        />
      ))}
    </div>
  );
}

const MARCAS = ['0', '6', '12', '18', '24'];

export function FranjasSemanaEditor({ idBase, dias, onChange }: Props): React.ReactElement {
  function cambiarDia(dia: number, franjas: FranjaDia[]): void {
    onChange({ ...dias, [dia]: franjas });
  }

  function copiarATodos(dia: number): void {
    const origen = dias[dia] ?? [];
    const copia: FranjasPorDia = {};
    for (const d of ORDEN_DIAS) copia[d] = origen.map((f) => ({ ...f }));
    onChange(copia);
  }

  return (
    <div className="space-y-1">
      {/* Escala de la pista, alineada con la columna de las pistas. Solo en pantallas anchas. */}
      <div className="hidden grid-cols-[6.5rem_minmax(9rem,13rem)_1fr] gap-x-4 md:grid" aria-hidden="true">
        <span />
        <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
          {MARCAS.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
        <span />
      </div>

      <ul className="divide-y divide-border">
        {ORDEN_DIAS.map((dia) => {
          const franjas = dias[dia] ?? [];
          const nombre = NOMBRE_DIA[dia];
          const siguiente = (NOMBRE_DIA[(dia + 1) % 7] ?? '').toLowerCase();
          return (
            <li
              key={dia}
              className="grid grid-cols-[6.5rem_1fr] items-start gap-x-4 gap-y-2 py-3 md:grid-cols-[6.5rem_minmax(9rem,13rem)_1fr]"
            >
              <span className="pt-2 text-sm font-medium text-foreground">{nombre}</span>

              <div className="col-span-2 row-start-2 pt-3.5 md:col-span-1 md:row-start-auto">
                <PistaDia segmentos={segmentosDelDia(dia, dias)} />
              </div>

              <div className="col-start-2 row-start-1 space-y-2 md:col-start-auto md:row-start-auto">
                {franjas.length === 0 ? (
                  <p className="pt-2 text-sm text-muted-foreground">Sin envíos</p>
                ) : null}

                {franjas.map((f, i) => {
                  const err = errorDeFranja(f);
                  const idDesde = `${idBase}-${dia}-${i}-desde`;
                  const idHasta = `${idBase}-${dia}-${i}-hasta`;
                  const idError = `${idBase}-${dia}-${i}-error`;
                  const mensaje = err.desde ?? err.hasta;
                  const actualizar = (cambios: Partial<FranjaDia>): void =>
                    cambiarDia(
                      dia,
                      franjas.map((x, j) => (j === i ? { ...x, ...cambios } : x)),
                    );
                  return (
                    <div key={i}>
                      <div className="flex items-center gap-2">
                        <Input
                          id={idDesde}
                          aria-label={`${nombre}, franja ${i + 1}: desde`}
                          aria-invalid={err.desde ? true : undefined}
                          aria-describedby={mensaje ? idError : undefined}
                          value={f.desde}
                          onChange={(e) => actualizar({ desde: e.target.value })}
                          inputMode="numeric"
                          placeholder="08:00"
                          maxLength={5}
                          className="h-8 w-[4.5rem] text-center tabular-nums"
                        />
                        <span className="text-sm text-muted-foreground">a</span>
                        <Input
                          id={idHasta}
                          aria-label={`${nombre}, franja ${i + 1}: hasta`}
                          aria-invalid={err.hasta ? true : undefined}
                          aria-describedby={mensaje ? idError : undefined}
                          value={f.hasta}
                          onChange={(e) => actualizar({ hasta: e.target.value })}
                          inputMode="numeric"
                          placeholder="19:00"
                          maxLength={5}
                          className="h-8 w-[4.5rem] text-center tabular-nums"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-foreground"
                          aria-label={`Quitar la franja ${i + 1} del ${nombre.toLowerCase()}`}
                          onClick={() => cambiarDia(dia, franjas.filter((_, j) => j !== i))}
                        >
                          <X className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                      {mensaje ? (
                        <p id={idError} className="mt-1 text-xs text-destructive">
                          {mensaje}
                        </p>
                      ) : cruzaMedianoche(f) ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Termina el {siguiente} a las {f.hasta}.
                        </p>
                      ) : null}
                    </div>
                  );
                })}

                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => cambiarDia(dia, [...franjas, franjaNueva(franjas)])}
                  >
                    <Plus className="mr-1 size-3.5" aria-hidden="true" />
                    Añadir franja
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => copiarATodos(dia)}
                      >
                        <CopyCheck className="mr-1 size-3.5" aria-hidden="true" />
                        Copiar a todos los días
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Reemplaza el horario de los demás días por el del {nombre.toLowerCase()}.
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
