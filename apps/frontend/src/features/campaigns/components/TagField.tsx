import { useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { TagChip } from '@/features/tags/components/TagChip';
import { useTags } from '@/features/tags/hooks/useTags';
import { TAG_NOMBRE_MAX } from '@/features/tags/types';
import type { ValorEtiqueta } from '../lib/etiqueta.js';

interface Props {
  valor: ValorEtiqueta;
  onChange: (valor: ValorEtiqueta) => void;
  /** Nombre propuesto al crear una nueva: «Campaña {nombre} - {fecha}». */
  sugerido: string;
}

/** Comparación como la del índice único del backend: sin mayúsculas ni acentos. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
}

type Modo = 'nueva' | 'existente';

/**
 * La etiqueta que recibirán los destinatarios enviados con éxito (HU-MARK-07).
 *
 * Dos caminos explícitos y no uno «inteligente»: con el nombre sugerido ya escrito, las etiquetas
 * existentes nunca aparecían como sugerencia, y quien quería reunir varias campañas bajo una
 * etiqueta de `/etiquetas` no tenía cómo encontrarla. Ahora se elige primero qué se quiere hacer:
 *
 * - **Crear nueva** — un campo con el nombre sugerido, editable. Si coincide con una existente
 *   (sin importar mayúsculas ni acentos) se avisa de que se usará esa: es lo que hará el servidor.
 * - **Usar una existente** — la lista completa, con buscador, en el mismo panel. En línea y no en
 *   un `Popover`: este campo vive dentro del diálogo del asistente, y un popover anidado ahí ya dio
 *   problemas de apertura (ver `AudienceBuilder`).
 *
 * Las etiquetas de semaforización no se ofrecen: describen el estado de la conversación y las
 * mueve la IA; mezclarlas con el seguimiento de una campaña las volvería ambiguas.
 */
export function TagField({ valor, onChange, sugerido }: Props): React.ReactElement {
  const id = useId();
  const { data: etiquetas, isLoading } = useTags();

  const disponibles = useMemo(
    () => (etiquetas ?? []).filter((t) => t.semaforo === null),
    [etiquetas],
  );

  const activo = valor !== null;
  const modo: Modo = valor?.modo ?? 'nueva';
  const nombre = valor?.modo === 'nueva' ? valor.nombre : '';
  const elegida = valor?.modo === 'existente' ? valor.tag : null;

  const coincidente = useMemo(
    () =>
      nombre.trim()
        ? (disponibles.find((t) => normalizar(t.nombre) === normalizar(nombre)) ?? null)
        : null,
    [disponibles, nombre],
  );

  function cambiarModo(siguiente: Modo): void {
    onChange(
      siguiente === 'nueva'
        ? { modo: 'nueva', nombre: sugerido }
        : { modo: 'existente', tag: null },
    );
  }

  return (
    <section aria-label="Etiqueta" className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor={`${id}-switch`} className="text-sm font-semibold">
            Etiquetar a quienes lo reciban
          </Label>
          <p className="text-sm text-muted-foreground">
            Solo a los envíos que salgan bien. Después podrás filtrar por ella en Leads y en otras
            campañas.
          </p>
        </div>
        <Switch
          id={`${id}-switch`}
          checked={activo}
          onCheckedChange={(on) => onChange(on ? { modo: 'nueva', nombre: sugerido } : null)}
        />
      </div>

      {activo ? (
        <>
          <ToggleGroup
            type="single"
            value={modo}
            onValueChange={(v) => {
              if (v && v !== modo) cambiarModo(v as Modo);
            }}
            aria-label="Qué etiqueta usar"
            className="inline-flex w-full rounded-lg border border-border bg-muted/40 p-1 sm:w-auto"
          >
            <ToggleGroupItem
              value="nueva"
              className="h-8 flex-1 rounded-md px-3 text-sm text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm sm:flex-none"
            >
              Crear nueva
            </ToggleGroupItem>
            <ToggleGroupItem
              value="existente"
              className="h-8 flex-1 rounded-md px-3 text-sm text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm sm:flex-none"
            >
              Usar una existente
            </ToggleGroupItem>
          </ToggleGroup>

          {modo === 'nueva' ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-nombre`}>Nombre de la etiqueta</Label>
              <Input
                id={`${id}-nombre`}
                value={nombre}
                maxLength={TAG_NOMBRE_MAX}
                aria-describedby={`${id}-ayuda`}
                onChange={(e) => onChange({ modo: 'nueva', nombre: e.target.value })}
              />
              <div
                id={`${id}-ayuda`}
                className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {coincidente ? (
                    <>
                      Ya existe y se usará esa: <TagChip tag={coincidente} className="max-w-48" />
                    </>
                  ) : nombre.trim() ? (
                    'Se creará al enviar la campaña.'
                  ) : (
                    'Escribe un nombre para la etiqueta.'
                  )}
                </span>
                <span className="shrink-0 tabular-nums">
                  {nombre.length}/{TAG_NOMBRE_MAX}
                </span>
              </div>
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : disponibles.length === 0 ? (
            <p className="rounded-md bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
              Todavía no tienes etiquetas propias. Créalas en{' '}
              <Link to="/etiquetas" className="font-medium text-foreground underline-offset-4 hover:underline">
                Etiquetas
              </Link>{' '}
              o usa «Crear nueva».
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label id={`${id}-lista`}>Etiqueta</Label>
              <Command
                aria-labelledby={`${id}-lista`}
                className="rounded-md border border-border"
                // El valor de cada fila es el nombre: así el buscador de cmdk filtra por lo que se ve.
                filter={(v, busqueda) => (normalizar(v).includes(normalizar(busqueda)) ? 1 : 0)}
              >
                <CommandInput placeholder="Buscar etiqueta" />
                <CommandList className="max-h-52">
                  <CommandEmpty>Ninguna etiqueta con ese nombre.</CommandEmpty>
                  {disponibles.map((t) => {
                    const marcada = elegida?.id === t.id;
                    return (
                      <CommandItem
                        key={t.id}
                        value={t.nombre}
                        onSelect={() => onChange({ modo: 'existente', tag: t })}
                        aria-selected={marcada}
                        className={cn('gap-2', marcada && 'bg-accent')}
                      >
                        <TagChip tag={t} className="max-w-[calc(100%-1.5rem)]" />
                        {marcada ? (
                          <Check aria-hidden className="ml-auto h-4 w-4 shrink-0 text-primary" />
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandList>
              </Command>
              <p className="text-xs text-muted-foreground">
                {elegida
                  ? 'Los nuevos destinatarios se suman a quienes ya la tienen.'
                  : 'Elige la etiqueta que recibirán los destinatarios.'}
              </p>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
