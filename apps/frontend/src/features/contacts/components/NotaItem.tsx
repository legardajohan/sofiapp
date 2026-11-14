import { useState } from 'react';
import {
  CalendarClock,
  CircleCheck,
  ClipboardCheck,
  ClipboardX,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { estaVencido, etiquetaProgramacion } from '@/lib/agenda';
import { cn } from '@/lib/utils';
import { useDeleteNota, useUpdateNota } from '../hooks/useNotas.js';
import { fechaCompleta, fechaHora } from '../lib/fecha.js';
import type { CambiosNota, NotaDTO } from '../types.js';
import { ProgramacionPendiente } from './ProgramacionPendiente.js';
import type { AnticipacionAviso } from '../types.js';

interface Props {
  clienteId: string;
  nota: NotaDTO;
}

const MAX_TEXTO = 2000;

/** Distintivo del pendiente: su agenda y, si ya se cumplió, que está cerrado. */
function EstadoPendiente({ nota }: { nota: NotaDTO }): React.ReactElement | null {
  if (!nota.pendiente || !nota.programadoDia) return null;

  if (nota.estadoPendiente === 'cerrado') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-success-subtle px-1.5 py-px font-medium text-success">
        <CircleCheck className="size-3" aria-hidden="true" />
        Pendiente cerrado
      </span>
    );
  }

  const vencido = estaVencido(nota.programadoDia, nota.programadoHora);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-px font-medium',
        vencido ? 'bg-destructive-subtle text-destructive' : 'bg-primary/10 text-primary',
      )}
    >
      <CalendarClock className="size-3" aria-hidden="true" />
      {etiquetaProgramacion(nota.programadoDia, nota.programadoHora)}
      {vencido && <span className="font-normal">· vencido</span>}
    </span>
  );
}

/**
 * Una nota de la ficha, con sus acciones (HU-PDF-01): editar —texto y, si es pendiente, su fecha y
 * hora—, marcar/quitar pendiente y eliminar.
 *
 * Las acciones viven en un menú y no como botones sueltos: la lista de notas es densa y tres
 * iconos por nota competirían con el texto, que es lo que se viene a leer. El pendiente se marca
 * con un riel de color primario en lugar del gris neutro, más un distintivo con palabras: el color
 * solo no basta para quien no lo distingue.
 */
export function NotaItem({ clienteId, nota }: Props): React.ReactElement {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(nota.texto);
  const [dia, setDia] = useState(nota.programadoDia);
  const [hora, setHora] = useState(nota.programadoHora);
  const [aviso, setAviso] = useState<AnticipacionAviso>(nota.avisoAntesMin ?? 0);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const actualizar = useUpdateNota(clienteId);
  const eliminar = useDeleteNota(clienteId);

  const textoNuevo = borrador.trim();
  const cambios: CambiosNota = {
    ...(textoNuevo !== nota.texto ? { texto: textoNuevo } : {}),
    ...(nota.pendiente && dia && dia !== nota.programadoDia ? { programadoDia: dia } : {}),
    ...(nota.pendiente && hora !== nota.programadoHora ? { programadoHora: hora } : {}),
    ...(nota.pendiente && aviso !== (nota.avisoAntesMin ?? 0) ? { avisoAntesMin: aviso } : {}),
  };
  const puedeGuardar =
    textoNuevo.length > 0 && Object.keys(cambios).length > 0 && !actualizar.isPending;

  function empezarEdicion(): void {
    setBorrador(nota.texto);
    setDia(nota.programadoDia);
    setHora(nota.programadoHora);
    setAviso(nota.avisoAntesMin ?? 0);
    setEditando(true);
  }

  function guardar(): void {
    if (!puedeGuardar) return;
    actualizar.mutate({ notaId: nota.id, cambios }, { onSuccess: () => setEditando(false) });
  }

  function alternarPendiente(): void {
    actualizar.mutate({ notaId: nota.id, cambios: { pendiente: !nota.pendiente } });
  }

  return (
    <li
      className={cn(
        'group/nota relative space-y-1 border-l-2 pl-2.5',
        nota.pendiente && nota.estadoPendiente !== 'cerrado' ? 'border-primary' : 'border-border',
      )}
    >
      {editando ? (
        <div className="space-y-2">
          <Textarea
            aria-label="Editar nota"
            autoFocus
            className="resize-y text-sm"
            rows={3}
            value={borrador}
            maxLength={MAX_TEXTO}
            disabled={actualizar.isPending}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditando(false);
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) guardar();
            }}
          />
          {nota.pendiente && (
            <ProgramacionPendiente
              dia={dia}
              hora={hora}
              onDiaChange={setDia}
              onHoraChange={setHora}
              aviso={aviso}
              onAvisoChange={setAviso}
              disabled={actualizar.isPending}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={actualizar.isPending}
              onClick={() => setEditando(false)}
            >
              Cancelar
            </Button>
            <Button type="button" size="sm" disabled={!puedeGuardar} onClick={guardar}>
              {actualizar.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Guardar
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap pr-7 text-sm leading-relaxed text-foreground">
          {nota.texto}
        </p>
      )}

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/70">
          {nota.autor.nombre ?? 'Usuario eliminado'}
        </span>
        <span aria-hidden="true">·</span>
        <time dateTime={nota.createdAt} title={fechaCompleta(nota.createdAt)}>
          {fechaHora(nota.createdAt)}
        </time>
        <EstadoPendiente nota={nota} />
      </p>

      {!editando && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Acciones de la nota"
              className={cn(
                'absolute right-0 top-0 size-6 text-muted-foreground',
                // Atenuado en reposo y visible al acercarse; nunca oculto del todo, que en una
                // pantalla táctil no hay hover que lo revele.
                'opacity-60 transition-opacity duration-150 ease-out hover:opacity-100 focus-visible:opacity-100 group-hover/nota:opacity-100 data-[state=open]:opacity-100',
              )}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={empezarEdicion}>
              <Pencil className="size-4" aria-hidden="true" />
              {nota.pendiente ? 'Editar o reprogramar' : 'Editar'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={alternarPendiente} disabled={actualizar.isPending}>
              {nota.pendiente ? (
                <>
                  <ClipboardX className="size-4" aria-hidden="true" />
                  Quitar pendiente
                </>
              ) : (
                <>
                  <ClipboardCheck className="size-4" aria-hidden="true" />
                  Marcar como pendiente
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setConfirmarBorrado(true)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <AlertDialog open={confirmarBorrado} onOpenChange={setConfirmarBorrado}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar nota</AlertDialogTitle>
            <AlertDialogDescription>
              {nota.pendiente
                ? 'La nota y su pendiente dejarán de mostrarse en la ficha y en el embudo, también en el historial. No se puede deshacer.'
                : 'La nota dejará de mostrarse en la ficha. No se puede deshacer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => eliminar.mutate(nota.id)}
            >
              Eliminar nota
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
