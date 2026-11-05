import { useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
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
import { TAG_NOMBRE_MAX, type TagDTO } from '@/features/tags/types';
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
 * - **Usar una existente** — **todas** las de `/etiquetas`, con buscador, en el mismo panel. En
 *   línea y no en un `Popover`: este campo vive dentro de diálogos, y un popover anidado ahí ya dio
 *   problemas de apertura (ver `AudienceBuilder`).
 *
 * Las de semaforización también se ofrecen —son etiquetas creadas como cualquier otra y la página
 * de Etiquetas las lista—, pero en su propio grupo y al final: las mueve también la IA según la
 * conversación, y conviene que quien la elija lo vea.
 */
export function TagField({ valor, onChange, sugerido }: Props): React.ReactElement {
  const id = useId();
  const { data: etiquetas, isLoading } = useTags();

  const todas = useMemo(() => etiquetas ?? [], [etiquetas]);
  const grupos = useMemo(
    () =>
      [
        { titulo: 'Tus etiquetas', tags: todas.filter((t) => t.semaforo === null) },
        { titulo: 'Semaforización', tags: todas.filter((t) => t.semaforo !== null) },
      ].filter((g) => g.tags.length > 0),
    [todas],
  );

  const activo = valor !== null;
  const modo: Modo = valor?.modo ?? 'nueva';
  const nombre = valor?.modo === 'nueva' ? valor.nombre : '';
  const elegida = valor?.modo === 'existente' ? valor.tag : null;

  const coincidente = useMemo(
    () =>
      nombre.trim()
        ? (todas.find((t) => normalizar(t.nombre) === normalizar(nombre)) ?? null)
        : null,
    [todas, nombre],
  );

  function cambiarModo(siguiente: Modo): void {
    onChange(
      siguiente === 'nueva'
        ? { modo: 'nueva', nombre: sugerido }
        : { modo: 'existente', tag: null },
    );
  }

  function fila(t: TagDTO): React.ReactElement {
    const marcada = elegida?.id === t.id;
    return (
      <CommandItem
        key={t.id}
        // El valor de cada fila es el nombre (más el id, por si dos se ven iguales): así el
        // buscador de cmdk filtra por lo que se ve.
        value={`${t.nombre} ${t.id}`}
        keywords={[t.nombre]}
        onSelect={() => onChange({ modo: 'existente', tag: t })}
        aria-selected={marcada}
        className={cn('gap-2', marcada && 'bg-accent')}
      >
        <TagChip tag={t} className="max-w-[calc(100%-1.5rem)]" />
        {marcada ? <Check aria-hidden className="ml-auto h-4 w-4 shrink-0 text-primary" /> : null}
      </CommandItem>
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
              className="h-8 flex-1 gap-1.5 rounded-md px-3 text-sm text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm sm:flex-none"
            >
              Usar una existente
              {todas.length > 0 ? (
                <span className="tabular-nums text-muted-foreground">({todas.length})</span>
              ) : null}
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
          ) : todas.length === 0 ? (
            <p className="rounded-md bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
              Todavía no tienes etiquetas. Créalas en{' '}
              <Link
                to="/etiquetas"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
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
                filter={(_v, busqueda, keywords) =>
                  normalizar((keywords ?? []).join(' ')).includes(normalizar(busqueda)) ? 1 : 0
                }
              >
                <CommandInput placeholder="Buscar etiqueta" />
                <CommandList className="max-h-60">
                  <CommandEmpty>Ninguna etiqueta con ese nombre.</CommandEmpty>
                  {grupos.map((g) => (
                    <CommandGroup key={g.titulo} heading={grupos.length > 1 ? g.titulo : undefined}>
                      {g.tags.map(fila)}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
              <p className="text-xs text-muted-foreground">
                {elegida
                  ? elegida.semaforo !== null
                    ? 'Es de semaforización: la IA también la pone y la quita según la conversación.'
                    : 'Los nuevos destinatarios se suman a quienes ya la tienen.'
                  : 'Elige la etiqueta que recibirán los destinatarios.'}
              </p>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
