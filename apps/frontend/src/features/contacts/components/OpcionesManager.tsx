import { useState } from 'react';
import { Archive, Loader2, Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  useCreateContactOption,
  useDeleteContactOption,
  useUpdateContactOption,
} from '../hooks/useContactOptions.js';
import { COLOR_OPCION_DEFECTO } from '../lib/option-color.js';
import { ColorOpcionPicker } from './ColorOpcionPicker.js';
import type { OpcionDTO, TipoOpcion } from '../types.js';

interface Props {
  tipo: TipoOpcion;
  /** Nombre del catálogo en minúscula, tal como se lee dentro de una frase ("de interés"). */
  nombre: string;
  opciones: OpcionDTO[];
  onCerrar: () => void;
  disabled: boolean;
}

const MAX_OPCIONES = 30;

const pressable =
  'transition-[transform,color,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]';

/**
 * CRUD del catálogo de un campo de la ficha (interés / objeción / rol), embebido en el diálogo de
 * edición del contacto (HU-CRM-02).
 *
 * Va **dentro** del diálogo y no en uno propio a propósito: apilar overlays para editar una lista de
 * diez elementos complica el foco y el escape sin ganar nada. Y sus cambios se guardan al momento,
 * no con el resto del formulario, porque el catálogo es de la empresa entera: no tendría sentido que
 * cancelar la edición de un contacto deshiciera una opción que ya se usó para clasificar a otros.
 */
export function OpcionesManager({
  tipo,
  nombre,
  opciones,
  onCerrar,
  disabled,
}: Props): React.ReactElement {
  const [nueva, setNueva] = useState('');
  const [colorNuevo, setColorNuevo] = useState(COLOR_OPCION_DEFECTO);
  const [verArchivadas, setVerArchivadas] = useState(false);

  const crear = useCreateContactOption();
  const actualizar = useUpdateContactOption();
  const borrar = useDeleteContactOption();

  const activas = opciones.filter((o) => o.activo);
  const archivadas = opciones.filter((o) => !o.activo);
  const ocupado = disabled || crear.isPending;
  const puedeAgregar = nueva.trim() !== '' && !ocupado && activas.length < MAX_OPCIONES;

  function agregar(): void {
    if (!puedeAgregar) return;
    crear.mutate(
      { tipo, label: nueva.trim(), color: colorNuevo },
      {
        onSuccess: () => {
          setNueva('');
          // El color NO se reinicia: quien está creando una escala suele encadenar varias del mismo
          // tono, y volver al gris en cada alta le obligaría a reelegirlo cada vez.
        },
      },
    );
  }

  return (
    <section
      aria-label={`Opciones de ${nombre}`}
      className={cn(
        'space-y-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2',
        'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-150',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          Opciones de {nombre}
          <span className="ml-1.5 tabular-nums font-normal text-muted-foreground">
            {activas.length} / {MAX_OPCIONES}
          </span>
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7 shrink-0 text-muted-foreground', pressable)}
          aria-label={`Cerrar las opciones de ${nombre}`}
          onClick={onCerrar}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {activas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
          No queda ninguna opción de {nombre}. Agrega la primera para poder clasificar contactos.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {activas.map((opcion) => (
            <FilaOpcion
              key={opcion.id}
              opcion={opcion}
              nombre={nombre}
              disabled={ocupado}
              guardandoId={actualizar.isPending ? actualizar.variables?.id : undefined}
              onRenombrar={(label) => actualizar.mutate({ id: opcion.id, label })}
              onRecolorear={(color) => actualizar.mutate({ id: opcion.id, color })}
              onBorrar={() => borrar.mutate({ id: opcion.id, label: opcion.label })}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        {/* El color se elige ANTES de dar de alta, en el mismo sitio donde vive en cada fila ya
            creada: así la posición del control no cambia entre "crear" y "editar". */}
        <ColorOpcionPicker
          value={colorNuevo}
          onChange={setColorNuevo}
          disabled={ocupado || activas.length >= MAX_OPCIONES}
          etiqueta={`la nueva opción de ${nombre}`}
        />
        <Input
          aria-label={`Nueva opción de ${nombre}`}
          placeholder={`Agregar opción de ${nombre}`}
          className="h-8 flex-1 text-xs"
          value={nueva}
          maxLength={60}
          disabled={ocupado || activas.length >= MAX_OPCIONES}
          onChange={(e) => setNueva(e.target.value)}
          // Enter agrega sin enviar el formulario del contacto, que está por encima en el DOM.
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            agregar();
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-8 shrink-0', pressable)}
          disabled={!puedeAgregar}
          onClick={agregar}
        >
          {crear.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Agregar
        </Button>
      </div>

      {archivadas.length > 0 && (
        <>
          <Separator />
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded-sm text-left text-[11px] text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-expanded={verArchivadas}
            onClick={() => setVerArchivadas((v) => !v)}
          >
            <Archive className="h-3 w-3" aria-hidden="true" />
            {verArchivadas ? 'Ocultar' : 'Ver'} {archivadas.length} archivada
            {archivadas.length === 1 ? '' : 's'}
          </button>

          {verArchivadas && (
            <ul className="space-y-1.5">
              {archivadas.map((opcion) => (
                <li
                  key={opcion.id}
                  className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5"
                >
                  <span className="flex-1 truncate text-xs text-muted-foreground">
                    {opcion.label}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn('h-7 shrink-0 text-xs text-muted-foreground', pressable)}
                    disabled={ocupado}
                    onClick={() => actualizar.mutate({ id: opcion.id, activo: true })}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Los cambios se aplican a toda la empresa. Al eliminar una opción que ya tengan contactos
        registrados, se archiva para que sus fichas la sigan mostrando.
      </p>
    </section>
  );
}

/**
 * Una opción activa: se renombra en el sitio y se guarda al salir del campo o con Enter. Renombrar
 * no cambia su clave, así que los contactos que ya la tienen puesta pasan a mostrar el nombre nuevo.
 */
function FilaOpcion({
  opcion,
  nombre,
  disabled,
  guardandoId,
  onRenombrar,
  onRecolorear,
  onBorrar,
}: {
  opcion: OpcionDTO;
  nombre: string;
  disabled: boolean;
  guardandoId: string | undefined;
  onRenombrar: (label: string) => void;
  onRecolorear: (color: string) => void;
  onBorrar: () => void;
}): React.ReactElement {
  const [label, setLabel] = useState(opcion.label);
  const guardando = guardandoId === opcion.id;

  function confirmar(): void {
    const limpio = label.trim();
    // Un nombre vacío no borra la opción: se revierte. Borrar tiene su propio botón, y adivinar la
    // intención desde un campo en blanco haría destructivo un descuido.
    if (limpio === '' || limpio === opcion.label) {
      setLabel(opcion.label);
      return;
    }
    onRenombrar(limpio);
  }

  return (
    <li className="flex items-center gap-2">
      {/* Se guarda al instante, sin esperar al blur del nombre: elegir un color es una decisión
          cerrada en sí misma, no algo que se esté "escribiendo". */}
      <ColorOpcionPicker
        value={opcion.color}
        onChange={onRecolorear}
        disabled={disabled}
        etiqueta={opcion.label}
      />
      <Input
        aria-label={`Nombre de la opción ${opcion.label}`}
        className="h-8 flex-1 text-xs"
        value={label}
        maxLength={60}
        disabled={disabled}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            confirmar();
            return;
          }
          // Escape descarta la edición sin cerrar el diálogo del contacto.
          if (e.key === 'Escape' && label !== opcion.label) {
            e.preventDefault();
            e.stopPropagation();
            setLabel(opcion.label);
          }
        }}
      />
      {guardando ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Guardando" />
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive',
            pressable,
          )}
          aria-label={`Eliminar la opción ${opcion.label} de ${nombre}`}
          disabled={disabled}
          onClick={onBorrar}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  );
}
