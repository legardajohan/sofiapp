import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { fechaCorta } from '../lib/formato.js';
import { usePreviewFestivos } from '../hooks/useSendWindowConfig.js';
import { MAX_EXCEPCIONES, type Excepcion } from '../types.js';

interface Props {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  existentes: Excepcion[];
  /** Recibe solo las fechas nuevas: la fusión sin duplicados la hace este diálogo. */
  onImportar: (nuevas: Excepcion[]) => void;
}

export function ImportarFestivosDialog({ open, onOpenChange, existentes, onImportar }: Props): React.ReactElement {
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const preview = usePreviewFestivos();
  const { mutate } = preview;

  const yaEstan = new Set(existentes.map((e) => e.fecha));
  const festivos = preview.data ?? [];
  const nuevos = festivos.filter((f) => !yaEstan.has(f.fecha));
  const cupo = MAX_EXCEPCIONES - existentes.length;

  useEffect(() => {
    if (!open) return;
    mutate(anio, {
      // Por defecto, todos los que aún no estén: es lo que se quiere casi siempre.
      onSuccess: (lista) => setElegidas(new Set(lista.map((f) => f.fecha))),
    });
  }, [open, anio, mutate]);

  const aImportar = nuevos.filter((f) => elegidas.has(f.fecha));
  const excede = aImportar.length > cupo;

  function importar(): void {
    onImportar(
      aImportar.map((f) => ({ fecha: f.fecha, tipo: 'cerrado', motivo: f.motivo, origen: 'festivo' })),
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar festivos de Colombia</DialogTitle>
          <DialogDescription>
            Se agregan como días sin envíos. Después puedes cambiar cualquiera a un horario
            especial o quitarlo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Label htmlFor="festivos-anio" className="shrink-0">
              Año
            </Label>
            <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
              <SelectTrigger id="festivos-anio" className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[anioActual, anioActual + 1].map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            {preview.isPending ? (
              <div className="space-y-2 p-3" aria-busy="true" aria-label="Cargando festivos">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : preview.isError ? (
              <div className="space-y-2 p-4 text-sm">
                <p className="text-foreground">No se pudieron cargar los festivos.</p>
                <Button type="button" variant="link" className="h-auto p-0" onClick={() => mutate(anio)}>
                  Reintentar
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {festivos.map((f) => {
                  const id = `festivo-${f.fecha}`;
                  const repetido = yaEstan.has(f.fecha);
                  return (
                    <li key={f.fecha}>
                      <Label
                        htmlFor={id}
                        className="flex cursor-pointer items-center gap-3 px-3 py-2 font-normal hover:bg-muted/50 has-[:disabled]:cursor-default has-[:disabled]:hover:bg-transparent"
                      >
                        <Checkbox
                          id={id}
                          disabled={repetido}
                          checked={repetido || elegidas.has(f.fecha)}
                          onCheckedChange={(v) =>
                            setElegidas((prev) => {
                              const s = new Set(prev);
                              if (v === true) s.add(f.fecha);
                              else s.delete(f.fecha);
                              return s;
                            })
                          }
                        />
                        <span className="w-32 shrink-0 text-sm tabular-nums text-foreground">
                          {fechaCorta(f.fecha)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-secondary-foreground">
                          {f.motivo}
                        </span>
                        {repetido ? <span className="text-xs text-muted-foreground">Ya está</span> : null}
                      </Label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {excede ? (
            <p className="text-sm text-destructive">
              Solo caben {cupo} fechas más (máximo {MAX_EXCEPCIONES}). Desmarca algunas.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button
            type="button"
            onClick={importar}
            disabled={aImportar.length === 0 || excede}
            className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
          >
            {preview.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : null}
            {aImportar.length === 1 ? 'Agregar 1 fecha' : `Agregar ${aImportar.length} fechas`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
