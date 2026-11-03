import { useState } from 'react';
import { es } from 'react-day-picker/locale';
import { CalendarPlus, CalendarRange, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { aFechaIso, deFechaIso, fechaCorta } from '../lib/formato.js';
import { errorDeFranja } from '../lib/validacion.js';
import {
  CATEGORIAS_ENVIO,
  CATEGORIA_INFO,
  MAX_EXCEPCIONES,
  type CategoriaEnvio,
  type Excepcion,
  type TipoExcepcion,
} from '../types.js';

interface Props {
  excepciones: Excepcion[];
  errores: Record<number, string[]>;
  onChange: (excepciones: Excepcion[]) => void;
  onImportar: () => void;
}

function AplicaA({
  valor,
  onChange,
}: {
  valor: CategoriaEnvio[] | undefined;
  onChange: (c: CategoriaEnvio[] | undefined) => void;
}): React.ReactElement {
  const elegidas = valor ?? [];
  const resumen =
    elegidas.length === 0
      ? 'Todos los mensajes'
      : elegidas.length === 1
        ? CATEGORIA_INFO[elegidas[0]!].nombre
        : `${elegidas.length} tipos`;

  function alternar(c: CategoriaEnvio, marcada: boolean): void {
    const siguiente = marcada ? [...elegidas, c] : elegidas.filter((x) => x !== c);
    // Marcar todas equivale a no restringir: se guarda vacío, que es "todas" para el backend.
    onChange(siguiente.length === 0 || siguiente.length === CATEGORIAS_ENVIO.length ? undefined : siguiente);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 w-full justify-start truncate font-normal">
          {resumen}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-1 p-2">
        <p className="px-2 pb-1 pt-0.5 text-xs text-muted-foreground">
          Sin marcar ninguno, aplica a todos.
        </p>
        {CATEGORIAS_ENVIO.map((c) => {
          const id = `aplica-${c}`;
          return (
            <Label
              key={c}
              htmlFor={id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 font-normal hover:bg-muted"
            >
              <Checkbox
                id={id}
                checked={elegidas.includes(c)}
                onCheckedChange={(v) => alternar(c, v === true)}
              />
              <span className="text-sm">{CATEGORIA_INFO[c].nombre}</span>
            </Label>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export function ExcepcionesTable({ excepciones, errores, onChange, onImportar }: Props): React.ReactElement {
  const [calendarioAbierto, setCalendarioAbierto] = useState(false);
  const lleno = excepciones.length >= MAX_EXCEPCIONES;
  // Se muestran por fecha, pero se editan por su índice real (el que usan los errores).
  const filas = excepciones
    .map((e, indice) => ({ e, indice }))
    .sort((a, b) => a.e.fecha.localeCompare(b.e.fecha));

  function actualizar(indice: number, cambios: Partial<Excepcion>): void {
    onChange(excepciones.map((e, i) => (i === indice ? { ...e, ...cambios } : e)));
  }

  function agregar(dia: Date | undefined): void {
    if (!dia) return;
    setCalendarioAbierto(false);
    const fecha = aFechaIso(dia);
    if (excepciones.some((e) => e.fecha === fecha)) return;
    onChange([...excepciones, { fecha, tipo: 'cerrado', origen: 'manual' }]);
  }

  function cambiarTipo(indice: number, tipo: TipoExcepcion): void {
    const actual = excepciones[indice];
    actualizar(indice, {
      tipo,
      franjas: tipo === 'franjas' ? (actual?.franjas?.length ? actual.franjas : [{ desde: '09:00', hasta: '13:00' }]) : undefined,
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-card" aria-labelledby="excepciones-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <h2 id="excepciones-titulo" className="text-base font-semibold text-foreground">
            Fechas especiales
          </h2>
          <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
            Festivos o días puntuales en que cambia el horario. En esas fechas manda lo que pongas
            aquí, no el horario de la semana.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onImportar} disabled={lleno}>
            <CalendarRange className="mr-1.5 size-4" aria-hidden="true" />
            Importar festivos
          </Button>
          <Popover open={calendarioAbierto} onOpenChange={setCalendarioAbierto}>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" disabled={lleno}>
                <CalendarPlus className="mr-1.5 size-4" aria-hidden="true" />
                Agregar fecha
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="single"
                locale={es}
                onSelect={agregar}
                disabled={excepciones.map((e) => deFechaIso(e.fecha))}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
          No hay fechas especiales. Importa los festivos o agrega los días en que tu empresa no
          atiende.
        </p>
      ) : (
        <div className="border-t border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40 pl-5">Fecha</TableHead>
                <TableHead className="w-60">Ese día</TableHead>
                <TableHead className="w-44">Aplica a</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="w-12 pr-5">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map(({ e, indice }) => {
                const errs = errores[indice] ?? [];
                const franjas = e.franjas ?? [];
                return (
                  <TableRow key={`${e.fecha}-${indice}`} className="align-top">
                    <TableCell className="pl-5 pt-4 text-sm tabular-nums text-foreground">
                      {fechaCorta(e.fecha)}
                      {errs.map((m) => (
                        <p key={m} role="alert" className="mt-1 text-xs text-destructive">
                          {m}
                        </p>
                      ))}
                    </TableCell>
                    <TableCell className="space-y-2">
                      <Select value={e.tipo} onValueChange={(v) => cambiarTipo(indice, v as TipoExcepcion)}>
                        <SelectTrigger className="h-8" aria-label={`Qué pasa el ${fechaCorta(e.fecha)}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cerrado">No se envía nada</SelectItem>
                          <SelectItem value="franjas">Horario especial</SelectItem>
                        </SelectContent>
                      </Select>
                      {e.tipo === 'franjas' ? (
                        <div className="space-y-1.5">
                          {franjas.map((f, j) => {
                            const err = errorDeFranja(f, true);
                            const cambiar = (c: Partial<typeof f>): void =>
                              actualizar(indice, { franjas: franjas.map((x, k) => (k === j ? { ...x, ...c } : x)) });
                            return (
                              <div key={j}>
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    aria-label={`${fechaCorta(e.fecha)}, franja ${j + 1}: desde`}
                                    aria-invalid={err.desde ? true : undefined}
                                    value={f.desde}
                                    onChange={(ev) => cambiar({ desde: ev.target.value })}
                                    inputMode="numeric"
                                    maxLength={5}
                                    className="h-8 w-[4.25rem] text-center tabular-nums"
                                  />
                                  <span className="text-xs text-muted-foreground">a</span>
                                  <Input
                                    aria-label={`${fechaCorta(e.fecha)}, franja ${j + 1}: hasta`}
                                    aria-invalid={err.hasta ? true : undefined}
                                    value={f.hasta}
                                    onChange={(ev) => cambiar({ hasta: ev.target.value })}
                                    inputMode="numeric"
                                    maxLength={5}
                                    className="h-8 w-[4.25rem] text-center tabular-nums"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-muted-foreground"
                                    aria-label={`Quitar la franja ${j + 1}`}
                                    onClick={() => actualizar(indice, { franjas: franjas.filter((_, k) => k !== j) })}
                                  >
                                    <X className="size-3.5" aria-hidden="true" />
                                  </Button>
                                </div>
                                {err.desde ?? err.hasta ? (
                                  <p className="mt-1 text-xs text-destructive">{err.desde ?? err.hasta}</p>
                                ) : null}
                              </div>
                            );
                          })}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => actualizar(indice, { franjas: [...franjas, { desde: '15:00', hasta: '18:00' }] })}
                          >
                            <Plus className="mr-1 size-3.5" aria-hidden="true" />
                            Añadir franja
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <AplicaA valor={e.categorias} onChange={(categorias) => actualizar(indice, { categorias })} />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Motivo del ${fechaCorta(e.fecha)}`}
                        value={e.motivo ?? ''}
                        onChange={(ev) => actualizar(indice, { motivo: ev.target.value || undefined })}
                        placeholder="Opcional"
                        maxLength={80}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell className="pr-5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        aria-label={`Quitar el ${fechaCorta(e.fecha)}`}
                        onClick={() => onChange(excepciones.filter((_, i) => i !== indice))}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
