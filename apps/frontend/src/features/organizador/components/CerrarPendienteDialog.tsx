import { useId, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  esYaGestionado,
  useCerrarConMotivo,
  useCrearMotivo,
  useMotivosCierre,
} from '../hooks/useOrganizador.js';
import { EtiquetasCliente } from './EtiquetasCliente.js';
import { ResumenPendiente } from './ResumenPendiente.js';
import type { MotivoKey, PendienteGestionable } from '../types.js';

const TEXTO_MIN = 3;
const TEXTO_MAX = 500;

interface Props {
  pendiente: PendienteGestionable | null;
  onClose: () => void;
}

/** Fila de motivo: casilla + etiqueta clicable, con área de toque generosa. */
function MotivoCheck({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-start gap-2.5 rounded-md px-2 py-1.5 [@media(hover:hover)]:hover:bg-muted/60">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <Label htmlFor={id} className="flex-1 cursor-pointer text-sm font-normal leading-snug">
        {label}
      </Label>
    </div>
  );
}

function FormularioCierre({
  pendiente,
  onClose,
}: {
  pendiente: PendienteGestionable;
  onClose: () => void;
}): React.ReactElement {
  const uid = useId();
  const motivos = useMotivosCierre(true);
  const crear = useCrearMotivo();
  const cerrar = useCerrarConMotivo();

  const [keys, setKeys] = useState<MotivoKey[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [conOtro, setConOtro] = useState(false);
  const [otroTexto, setOtroTexto] = useState('');
  const [comentario, setComentario] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [creando, setCreando] = useState(false);
  const [nuevoMotivo, setNuevoMotivo] = useState('');

  const otroValido = otroTexto.trim().length >= TEXTO_MIN;
  const hayMotivo = keys.length + ids.length > 0 || conOtro;
  const valido = hayMotivo && (!conOtro || otroValido);
  const ocupado = cerrar.isPending;

  function alternar<T>(lista: T[], valor: T, activo: boolean): T[] {
    return activo ? [...lista, valor] : lista.filter((v) => v !== valor);
  }

  function guardarMotivo(): void {
    const nombre = nuevoMotivo.trim();
    if (nombre.length < TEXTO_MIN) return;
    crear.mutate(nombre, {
      onSuccess: (m) => {
        // Crear un motivo desde aquí es porque aplica a ESTE cierre: queda marcado.
        setIds((prev) => [...prev, m.id]);
        setNuevoMotivo('');
        setCreando(false);
      },
    });
  }

  function confirmar(): void {
    if (!valido) return;
    cerrar.mutate(
      {
        id: pendiente.id,
        clienteId: pendiente.clienteId,
        input: {
          motivoKeys: keys,
          motivoIds: ids,
          ...(conOtro ? { otro: { texto: otroTexto.trim() } } : {}),
          ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
          tagIds,
          version: pendiente.version,
        },
      },
      // Ya gestionado en otra pestaña (409): no hay nada más que hacer aquí, se cierra igual.
      { onSettled: (_d, error) => (!error || esYaGestionado(error) ? onClose() : undefined) },
    );
  }

  return (
    <>
      <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
        <ResumenPendiente pendiente={pendiente} />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Motivo del cierre <span className="text-destructive">*</span>
          </legend>
          <p className="text-xs text-muted-foreground">Puedes marcar más de uno.</p>

          {motivos.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-3/5" />
            </div>
          ) : (
            <div className="grid gap-0.5 sm:grid-cols-2">
              {(motivos.data?.predefinidos ?? []).map((m) => (
                <MotivoCheck
                  key={m.key}
                  id={`${uid}-${m.key}`}
                  label={m.nombre}
                  checked={keys.includes(m.key)}
                  onChange={(v) => setKeys((prev) => alternar(prev, m.key, v))}
                />
              ))}
              {(motivos.data?.personalizados ?? []).map((m) => (
                <MotivoCheck
                  key={m.id}
                  id={`${uid}-${m.id}`}
                  label={m.nombre}
                  checked={ids.includes(m.id)}
                  onChange={(v) => setIds((prev) => alternar(prev, m.id, v))}
                />
              ))}
              <MotivoCheck
                id={`${uid}-otros`}
                label="Otros motivos"
                checked={conOtro}
                onChange={setConOtro}
              />
            </div>
          )}

          {conOtro && (
            <div className="space-y-1.5 pt-1">
              <Label htmlFor={`${uid}-otro-texto`} className="text-sm">
                Describe el motivo <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id={`${uid}-otro-texto`}
                value={otroTexto}
                maxLength={TEXTO_MAX}
                rows={2}
                onChange={(e) => setOtroTexto(e.target.value)}
                aria-invalid={otroTexto.length > 0 && !otroValido}
                aria-describedby={`${uid}-otro-ayuda`}
                placeholder="Ej. El cliente pagó en la sede"
              />
              <p id={`${uid}-otro-ayuda`} className="text-xs text-muted-foreground">
                Queda solo en el historial de este pendiente.
              </p>
            </div>
          )}

          {creando ? (
            <div className="flex items-center gap-2 pt-1">
              <Input
                autoFocus
                aria-label="Nombre del nuevo motivo"
                placeholder="Nombre del motivo"
                value={nuevoMotivo}
                maxLength={80}
                onChange={(e) => setNuevoMotivo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    guardarMotivo();
                  }
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setCreando(false);
                  }
                }}
                className="h-9"
              />
              <Button
                type="button"
                size="sm"
                disabled={nuevoMotivo.trim().length < TEXTO_MIN || crear.isPending}
                onClick={guardarMotivo}
              >
                {crear.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                Guardar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCreando(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setCreando(true)}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Crear nuevo motivo
            </Button>
          )}
        </fieldset>

        <EtiquetasCliente value={tagIds} onChange={setTagIds} disabled={ocupado} />

        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-comentario`} className="text-sm font-medium">
            Comentario <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Textarea
            id={`${uid}-comentario`}
            value={comentario}
            maxLength={1000}
            rows={2}
            onChange={(e) => setComentario(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        {!valido && (
          <p className="mr-auto self-center text-xs text-muted-foreground" aria-live="polite">
            {conOtro && !otroValido && hayMotivo
              ? 'Describe el motivo en «Otros motivos».'
              : 'Elige al menos un motivo.'}
          </p>
        )}
        <Button type="button" variant="outline" onClick={onClose} disabled={ocupado}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={confirmar}
          disabled={!valido || ocupado}
          className="motion-safe:active:scale-[0.97]"
        >
          {ocupado && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Confirmar cierre
        </Button>
      </DialogFooter>
    </>
  );
}

/** CERRAR PENDIENTE (HU-PDF-02 §5): motivo obligatorio, motivos reutilizables, etiquetas. */
export function CerrarPendienteDialog({ pendiente, onClose }: Props): React.ReactElement {
  return (
    <Dialog open={pendiente !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cerrar pendiente</DialogTitle>
          <DialogDescription>
            Cuéntanos cómo terminó. El cierre queda en el historial del cliente.
          </DialogDescription>
        </DialogHeader>
        {/* `key`: cada pendiente empieza con el formulario limpio. */}
        {pendiente && <FormularioCierre key={pendiente.id} pendiente={pendiente} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
