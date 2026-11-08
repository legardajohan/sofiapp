import { useState } from 'react';
import { Archive, Loader2, Lock, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  useArchiveContactField,
  useContactFields,
  useCreateContactField,
  useUpdateContactField,
} from '../hooks/useContactFields.js';
import { errorMessage } from '../lib/errors.js';
import { validarNombreCampo } from '../lib/campos.js';
import { TIPO_DATO_LABEL, TIPOS_DATO_CAMPO, type CampoContactoDTO, type TipoDatoCampo } from '../types.js';

const MAX_CAMPOS = 30;

const pressable =
  'transition-[transform,color,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SelectorTipo({
  value,
  onChange,
  disabled,
  etiqueta,
}: {
  value: TipoDatoCampo;
  onChange: (tipo: TipoDatoCampo) => void;
  disabled?: boolean;
  etiqueta: string;
}): React.ReactElement {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TipoDatoCampo)} disabled={disabled}>
      <SelectTrigger className="h-8 w-28 shrink-0 text-xs" aria-label={etiqueta}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TIPOS_DATO_CAMPO.map((t) => (
          <SelectItem key={t} value={t} className="text-xs">
            {TIPO_DATO_LABEL[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Gestor del catálogo de campos personalizados de la empresa (HU-FLOW-05). Se abre desde el nodo de
 * captura del editor de flujos y desde la ficha del contacto. Los cambios se guardan al momento: el
 * catálogo es de la empresa entera y no pertenece al formulario desde el que se abrió.
 *
 * La clave se VE pero no se edita: es lo que queda grabado en los contactos y en las condiciones de
 * los flujos, y cambiarla desharía ese vínculo. Renombrar solo cambia la etiqueta.
 */
export function CamposPersonalizadosManager({ open, onOpenChange }: Props): React.ReactElement {
  const { data: campos = [], isLoading } = useContactFields(true);
  const crear = useCreateContactField();
  const actualizar = useUpdateContactField();
  const archivar = useArchiveContactField();

  const [label, setLabel] = useState('');
  const [tipo, setTipo] = useState<TipoDatoCampo>('texto');
  const [sensible, setSensible] = useState(false);
  const [verArchivados, setVerArchivados] = useState(false);

  const activos = campos.filter((c) => c.activo);
  const archivados = campos.filter((c) => !c.activo);
  // Solo se compara con los campos ACTIVOS: uno archivado con el mismo nombre no es un duplicado,
  // crearlo lo reactiva (el servidor lo hace así).
  const error = label.trim() === '' ? null : validarNombreCampo(label, activos);
  const errorServidor = crear.isError ? errorMessage(crear.error, 'No se pudo crear el campo.') : null;
  const puedeAgregar =
    label.trim() !== '' && error === null && !crear.isPending && activos.length < MAX_CAMPOS;
  const errorId = 'campo-nuevo-error';

  function agregar(): void {
    if (!puedeAgregar) return;
    crear.mutate(
      { label: label.trim(), tipoDato: tipo, sensible },
      {
        onSuccess: () => {
          setLabel('');
          setSensible(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Campos personalizados</DialogTitle>
          <DialogDescription>
            Datos propios de tu empresa (colegio, ciudad, presupuesto…). Se definen una sola vez y los usan
            la ficha del contacto y las preguntas de tus flujos, así «Colegio» siempre es el mismo dato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : activos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
              Aún no hay campos. Crea el primero abajo: por ejemplo «Colegio» o «Ciudad».
            </p>
          ) : (
            <ul className="space-y-1.5">
              {activos.map((campo) => (
                <FilaCampo
                  key={campo.id}
                  campo={campo}
                  todos={campos}
                  onRenombrar={(nuevo) => actualizar.mutate({ id: campo.id, label: nuevo })}
                  onTipo={(t) => actualizar.mutate({ id: campo.id, tipoDato: t })}
                  onSensible={(s) => actualizar.mutate({ id: campo.id, sensible: s })}
                  onArchivar={() => archivar.mutate({ id: campo.id, label: campo.label })}
                />
              ))}
            </ul>
          )}

          <div className="space-y-1.5 border-t border-border pt-3">
            <Label htmlFor="campo-nuevo" className="text-xs text-muted-foreground">
              Nuevo campo
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="campo-nuevo"
                className="h-8 flex-1 text-xs"
                placeholder="Colegio"
                value={label}
                maxLength={60}
                disabled={activos.length >= MAX_CAMPOS}
                aria-invalid={error !== null || errorServidor !== null}
                aria-describedby={error || errorServidor ? errorId : undefined}
                onChange={(e) => {
                  setLabel(e.target.value);
                  if (crear.isError) crear.reset();
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  agregar();
                }}
              />
              <SelectorTipo value={tipo} onChange={setTipo} etiqueta="Tipo del nuevo campo" />
              <div className="flex shrink-0 items-center gap-1.5">
                <Switch id="campo-nuevo-sensible" checked={sensible} onCheckedChange={setSensible} />
                <Label htmlFor="campo-nuevo-sensible" className="cursor-pointer text-[11px] font-normal text-muted-foreground">
                  Sensible
                </Label>
              </div>
              <Button type="button" size="sm" className={cn('h-8', pressable)} disabled={!puedeAgregar} onClick={agregar}>
                {crear.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Agregar
              </Button>
            </div>
            {error || errorServidor ? (
              <p id={errorId} role="alert" className="text-[11px] text-destructive">
                {error ?? errorServidor}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                «Sensible» oculta el valor a quien no tenga permiso para ver datos sensibles.
              </p>
            )}
          </div>

          {archivados.length > 0 ? (
            <div className="border-t border-border pt-2">
              <button
                type="button"
                onClick={() => setVerArchivados((v) => !v)}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                aria-expanded={verArchivados}
              >
                {verArchivados ? 'Ocultar archivados' : `Ver archivados (${archivados.length})`}
              </button>
              {verArchivados ? (
                <ul className="mt-2 space-y-1.5">
                  {archivados.map((campo) => (
                    <li
                      key={campo.id}
                      className="flex items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{campo.label}</span>
                      <code className="text-[10px] text-muted-foreground">{campo.key}</code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn('h-7 text-xs', pressable)}
                        disabled={crear.isPending || activos.length >= MAX_CAMPOS}
                        // Volver a crear con el mismo nombre lo reactiva (el servidor lo hace así).
                        onClick={() =>
                          crear.mutate({ label: campo.label, tipoDato: campo.tipoDato, sensible: campo.sensible })
                        }
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Restaurar
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilaCampo({
  campo,
  todos,
  onRenombrar,
  onTipo,
  onSensible,
  onArchivar,
}: {
  campo: CampoContactoDTO;
  todos: CampoContactoDTO[];
  onRenombrar: (label: string) => void;
  onTipo: (tipo: TipoDatoCampo) => void;
  onSensible: (sensible: boolean) => void;
  onArchivar: () => void;
}): React.ReactElement {
  const [valor, setValor] = useState(campo.label);
  const [confirmando, setConfirmando] = useState(false);
  const error = validarNombreCampo(valor, todos, campo.id);
  const errorId = `campo-error-${campo.id}`;

  function confirmarNombre(): void {
    const limpio = valor.trim();
    if (limpio === campo.label) return;
    if (error) {
      // Un nombre inválido no se envía: se vuelve al guardado para no dejar el input en un estado
      // que el servidor nunca tuvo.
      setValor(campo.label);
      return;
    }
    onRenombrar(limpio);
  }

  return (
    <li className="space-y-1 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Nombre del campo ${campo.label}`}
          className="h-8 flex-1 text-xs"
          value={valor}
          maxLength={60}
          aria-invalid={error !== null && valor.trim() !== campo.label}
          aria-describedby={error && valor.trim() !== campo.label ? errorId : undefined}
          onChange={(e) => setValor(e.target.value)}
          onBlur={confirmarNombre}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setValor(campo.label);
          }}
        />
        <SelectorTipo value={campo.tipoDato} onChange={onTipo} etiqueta={`Tipo de ${campo.label}`} />
        <div className="flex shrink-0 items-center gap-1">
          <Switch
            checked={campo.sensible}
            onCheckedChange={onSensible}
            aria-label={`${campo.label} es sensible`}
          />
          <Lock
            className={cn('h-3 w-3', campo.sensible ? 'text-foreground' : 'text-muted-foreground/40')}
            aria-hidden="true"
          />
        </div>
        {confirmando ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className={cn('h-7 text-xs', pressable)}
              onClick={() => {
                setConfirmando(false);
                onArchivar();
              }}
            >
              Archivar
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmando(false)}>
              No
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive', pressable)}
            aria-label={`Archivar el campo ${campo.label}`}
            onClick={() => setConfirmando(true)}
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <p className="flex items-center gap-1.5 px-0.5 text-[10px] text-muted-foreground">
        Clave: <code>{campo.key}</code>
        {confirmando ? <span> · Deja de ofrecerse; los contactos que ya lo tienen lo conservan.</span> : null}
      </p>
      {error && valor.trim() !== campo.label ? (
        <p id={errorId} role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}
