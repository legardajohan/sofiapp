import { useId, useState } from 'react';
import { Loader2, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useCreateNota, useNotas } from '../hooks/useNotas.js';
import { esSinPermiso } from '../lib/errors.js';
import { NotaItem } from './NotaItem.js';
import { ProgramacionPendiente } from './ProgramacionPendiente.js';
import type { AnticipacionAviso } from '../types.js';

interface Props {
  clienteId: string;
  /** Lo que dice el backend en la ficha: evita pedir notas que van a devolver 403. */
  puedeVerSensibles: boolean;
}

const MAX_TEXTO = 2000;

// Mismo gesto de presión que las otras tarjetas de la ficha: las acciones deben sentirse iguales.
const pressable =
  'transition-[transform,color,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]';

export function ContactNotesCard({
  clienteId,
  puedeVerSensibles,
}: Props): React.ReactElement | null {
  const [texto, setTexto] = useState('');
  // HU-PDF-01: apagado por defecto y de vuelta a apagado tras cada nota. Que se quedara encendido
  // convertiría en pendientes, sin querer, las notas que vienen detrás.
  const [pendiente, setPendiente] = useState(false);
  // HU-PDF-01 A1: sin elegir nada, el pendiente es de hoy y de todo el día.
  const [programadoDia, setProgramadoDia] = useState<string | null>(null);
  const [programadoHora, setProgramadoHora] = useState<string | null>(null);
  // HU-PDF-02 A1: sin anticipación por defecto; se vuelve a 0 tras cada nota.
  const [avisoAntesMin, setAvisoAntesMin] = useState<AnticipacionAviso>(0);
  const switchId = useId();
  const { data, isLoading, error } = useNotas(clienteId, puedeVerSensibles);
  const crear = useCreateNota(clienteId);

  // Sin permiso la tarjeta no existe. No es un estado de error: es que estas notas no son para este
  // usuario, y un mensaje de "acceso denegado" solo añadiría ruido a un panel ya denso.
  if (!puedeVerSensibles || esSinPermiso(error)) return null;

  const notas = data?.data ?? [];
  const puedeGuardar = texto.trim().length > 0 && !crear.isPending;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!puedeGuardar) return;
    crear.mutate(
      {
        texto: texto.trim(),
        pendiente,
        ...(pendiente && programadoDia ? { programadoDia } : {}),
        ...(pendiente && programadoHora ? { programadoHora } : {}),
        ...(pendiente && avisoAntesMin > 0 ? { avisoAntesMin } : {}),
      },
      {
        onSuccess: () => {
          setTexto('');
          setPendiente(false);
          setProgramadoDia(null);
          setProgramadoHora(null);
          setAvisoAntesMin(0);
        },
      },
    );
  }

  return (
    <section className="space-y-2.5 rounded-lg border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-2">
        <NotebookPen className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">Notas</h3>
        {data && data.total > 0 && (
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {data.total}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-1.5" aria-live="polite" aria-busy="true">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ) : error ? (
        <p role="alert" className="text-xs text-destructive">
          No se pudieron cargar las notas.
        </p>
      ) : notas.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aún no hay notas. Anota lo que no debe perderse entre mensajes: un acuerdo, una fecha, un
          motivo.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {notas.map((nota) => (
            <NotaItem key={nota.id} clienteId={clienteId} nota={nota} />
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          aria-label="Nueva nota"
          className="resize-y text-sm"
          rows={2}
          value={texto}
          maxLength={MAX_TEXTO}
          placeholder="Escribe una nota…"
          disabled={crear.isPending}
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Switch
            id={switchId}
            checked={pendiente}
            onCheckedChange={setPendiente}
            disabled={crear.isPending}
          />
          <Label htmlFor={switchId} className="cursor-pointer text-xs font-normal text-foreground">
            Marcar como pendiente
          </Label>
        </div>
        {pendiente && (
          // Entra con un fundido corto bajo el interruptor que la reveló: es respuesta directa al
          // gesto del usuario, no decoración.
          <div className="motion-safe:duration-150 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1">
            <ProgramacionPendiente
              dia={programadoDia}
              hora={programadoHora}
              onDiaChange={setProgramadoDia}
              onHoraChange={setProgramadoHora}
              aviso={avisoAntesMin}
              onAvisoChange={setAvisoAntesMin}
              disabled={crear.isPending}
            />
          </div>
        )}
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className={cn('w-full', pressable)}
          disabled={!puedeGuardar}
        >
          {crear.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Guardando…
            </>
          ) : pendiente ? (
            'Agregar nota y pendiente'
          ) : (
            'Agregar nota'
          )}
        </Button>
      </form>
    </section>
  );
}
