import { useState } from 'react';
import { Archive, Check, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCreateSemaforo,
  useSemaforos,
  useUpdateSemaforo,
} from '../../semaforos/hooks/useSemaforos.js';
import type { SemaforoDTO } from '../../semaforos/types.js';
import { COLOR_ESTADO_DESCONOCIDO } from '../lib/format.js';

/** Punto de color. El hex es dato del tenant, por eso va en `style` y nunca como clase. */
function Punto({ color }: { color: string }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

/**
 * Una fila del catálogo, que alterna entre lectura y edición.
 *
 * Se edita en sitio en vez de abrir un segundo diálogo: son cuatro campos y anidar modales para
 * cambiar un nombre obliga a un viaje de ida y vuelta que la tarea no justifica.
 */
function Fila({ semaforo }: { semaforo: SemaforoDTO }): React.ReactElement {
  const [editando, setEditando] = useState(false);
  const [label, setLabel] = useState(semaforo.label);
  const [color, setColor] = useState(semaforo.color);
  const guardar = useUpdateSemaforo();

  const limpio = label.trim();

  function confirmar(): void {
    if (!limpio) return;
    guardar.mutate(
      { id: semaforo.id, label: limpio, color },
      { onSuccess: () => setEditando(false) },
    );
  }

  function cancelar(): void {
    // Reabrir la edición es empezar de cero, no heredar lo tecleado y descartado.
    setLabel(semaforo.label);
    setColor(semaforo.color);
    setEditando(false);
  }

  if (editando) {
    return (
      <li className="flex items-center gap-2 py-2">
        <Input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer p-1"
          aria-label={`Color de ${semaforo.label}`}
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirmar();
            if (e.key === 'Escape') cancelar();
          }}
          maxLength={60}
          className="h-9"
          aria-label={`Nombre de ${semaforo.label}`}
          autoFocus
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-9 shrink-0"
          onClick={confirmar}
          disabled={!limpio || guardar.isPending}
          aria-label="Guardar cambios"
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-9 shrink-0"
          onClick={cancelar}
          disabled={guardar.isPending}
          aria-label="Cancelar"
        >
          <X className="h-4 w-4" />
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 py-2">
      <Punto color={semaforo.color} />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {semaforo.label}
        {!semaforo.activo && <span className="ml-2 text-xs text-muted-foreground">Archivado</span>}
      </span>

      <Button
        size="sm"
        variant="ghost"
        className="h-8 shrink-0 text-muted-foreground"
        onClick={() => setEditando(true)}
        aria-label={`Editar ${semaforo.label}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      {/* Los cuatro de fábrica no se archivan: su clave es la que comparte el resto del CRM. En vez
          de un botón que siempre falla con un 409, aquí no hay botón — y se explica abajo. */}
      {!semaforo.esDefecto && semaforo.activo && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 shrink-0 text-muted-foreground"
          onClick={() => guardar.mutate({ id: semaforo.id, activo: false })}
          disabled={guardar.isPending}
          aria-label={`Archivar ${semaforo.label}`}
        >
          <Archive className="h-3.5 w-3.5" />
        </Button>
      )}

      {!semaforo.activo && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 shrink-0 text-muted-foreground"
          onClick={() => guardar.mutate({ id: semaforo.id, activo: true })}
          disabled={guardar.isPending}
        >
          Reactivar
        </Button>
      )}
    </li>
  );
}

/** Alta de un semáforo propio. Se pide lo mínimo: la clave y la posición las deriva el backend. */
function Alta(): React.ReactElement {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(COLOR_ESTADO_DESCONOCIDO);
  const crear = useCreateSemaforo();

  const limpio = label.trim();

  function enviar(e: React.FormEvent): void {
    e.preventDefault();
    if (!limpio) return;

    crear.mutate(
      { label: limpio, color },
      {
        onSuccess: () => {
          setLabel('');
          setColor(COLOR_ESTADO_DESCONOCIDO);
        },
      },
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <Label htmlFor="semaforo-nuevo" className="text-xs font-medium text-muted-foreground">
        Añadir uno propio
      </Label>
      <div className="flex items-center gap-2">
        <Input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer p-1"
          aria-label="Color del semáforo nuevo"
        />
        <Input
          id="semaforo-nuevo"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          placeholder="Tibio"
          className="h-9"
        />
        <Button type="submit" size="sm" className="h-9 shrink-0" disabled={!limpio || crear.isPending}>
          <Plus className="mr-1.5 h-4 w-4" />
          {crear.isPending ? 'Creando…' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}

/**
 * Catálogo de semáforos de la empresa (HU-CRM-04).
 *
 * Va en un diálogo y no en una pantalla propia: son cuatro filas más las que añada la empresa, y
 * se configuran justo donde se usan. Una entrada en el menú para esto sería más estructura que
 * contenido.
 */
export function SemaforosDialog(): React.ReactElement {
  const [abierto, setAbierto] = useState(false);
  const semaforos = useSemaforos();

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {/* Mismo `+` y misma forma que "Nuevo estado", que va justo al lado: los dos abren el
            catálogo de la empresa y deben leerse como el mismo tipo de acción. */}
        <Button variant="outline" size="sm" className="h-9">
          <Plus className="mr-1.5 h-4 w-4" />
          Semáforos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Semáforos</DialogTitle>
          <DialogDescription>
            Cómo clasifica tu empresa sus oportunidades. Renombra los cuatro base o añade los tuyos.
          </DialogDescription>
        </DialogHeader>

        {semaforos.isLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : semaforos.isError ? (
          <div className="mt-4 text-center">
            <p className="text-sm text-destructive">No se pudo cargar el catálogo de semáforos.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void semaforos.refetch()}
            >
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            <ul className="mt-2 divide-y divide-border">
              {(semaforos.data ?? []).map((semaforo) => (
                <Fila key={semaforo.id} semaforo={semaforo} />
              ))}
            </ul>

            <p className="text-xs text-muted-foreground">
              Los cuatro base se renombran y recolorean, pero no se archivan: el resto del CRM se
              apoya en ellos.
            </p>

            <Separator className="my-2" />

            <Alta />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
