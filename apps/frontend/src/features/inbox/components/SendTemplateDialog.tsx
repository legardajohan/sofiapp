import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiUrl } from '@/api/apiClient';
import { getWhatsAppTemplates, templateErrorMessage } from '@/api/whatsapp-templates';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { HeaderImageField } from '@/features/campaigns/components/HeaderImageField';
import { MessagePreview } from '@/features/campaigns/components/MessagePreview';
import { sendTemplateMessage } from '../api.js';

interface Props {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  clienteId: string;
  /** Nombre del contacto, para que el título diga a quién le llega. */
  nombre: string | null;
}

/**
 * Enviar una plantilla desde la conversación (HT-WA-04, criterio 12).
 *
 * Es la salida cuando la ventana de 24 h está cerrada: elegir una plantilla aprobada, rellenar sus
 * huecos y, si lleva imagen, quedarse con la de por defecto o cambiarla solo para este mensaje. La
 * vista previa va debajo del formulario y no al lado: el diálogo es estrecho porque la bandeja ya
 * ocupa la pantalla, y lo que se confirma al final es el mensaje entero.
 */
export function SendTemplateDialog({
  open,
  onOpenChange,
  clienteId,
  nombre,
}: Props): React.ReactElement {
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState('');
  const [parametros, setParametros] = useState<string[]>([]);
  const [imagen, setImagen] = useState<File | null>(null);
  const [urlImagen, setUrlImagen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTemplateId('');
    setParametros([]);
    setImagen(null);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!imagen) {
      setUrlImagen(null);
      return;
    }
    const url = URL.createObjectURL(imagen);
    setUrlImagen(url);
    return () => URL.revokeObjectURL(url);
  }, [imagen]);

  const { data: plantillas, isLoading } = useQuery({
    queryKey: ['templates', 'approved'],
    queryFn: () => getWhatsAppTemplates({ status: 'APPROVED', limit: 100 }),
    enabled: open,
  });

  // Solo las que se pueden enviar: documento y vídeo en la cabecera siguen sin poder adjuntarse.
  const enviables = useMemo(
    () =>
      (plantillas?.data ?? []).filter(
        (t) => !t.obsoleta && ['NINGUNA', 'TEXT', 'IMAGE'].includes(t.cabecera),
      ),
    [plantillas],
  );
  const plantilla = enviables.find((t) => t.id === templateId) ?? null;
  const llevaImagen = plantilla?.cabecera === 'IMAGE';
  const imagenDefectoUrl = plantilla?.imagen ? apiUrl(plantilla.imagen.url) : null;

  const mutation = useMutation({
    mutationFn: () =>
      sendTemplateMessage({
        clienteId,
        templateId,
        parametros,
        ...(llevaImagen && imagen ? { imagen } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['thread', clienteId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Plantilla enviada');
      onOpenChange(false);
    },
    onError: (err: Error) => {
      setError(templateErrorMessage(err, 'No se pudo enviar la plantilla. Intenta de nuevo.'));
    },
  });

  function elegirPlantilla(id: string): void {
    const elegida = enviables.find((t) => t.id === id);
    setTemplateId(id);
    setParametros(Array.from({ length: elegida?.parametrosBody ?? 0 }, () => ''));
    setImagen(null);
    setError(null);
  }

  const puedeEnviar =
    plantilla !== null &&
    parametros.every((p) => p.trim().length > 0) &&
    (!llevaImagen || imagenDefectoUrl !== null || imagen !== null) &&
    !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar plantilla{nombre ? ` a ${nombre}` : ''}</DialogTitle>
          <DialogDescription>
            Con la ventana de 24 h cerrada, solo se puede escribir con una plantilla aprobada por
            Meta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : enviables.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tienes plantillas aprobadas. Créalas desde Configuración, Plantillas, y vuelve
              cuando Meta las apruebe.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="enviar-plantilla">Plantilla</Label>
              <Select value={templateId} onValueChange={elegirPlantilla}>
                <SelectTrigger id="enviar-plantilla">
                  <SelectValue placeholder="Elige una plantilla" />
                </SelectTrigger>
                <SelectContent>
                  {enviables.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.language}){t.cabecera === 'IMAGE' ? ', con imagen' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {plantilla && plantilla.parametrosBody > 0 ? (
            <div className="space-y-2">
              <Label>Texto del mensaje</Label>
              {parametros.map((valor, i) => (
                <Input
                  key={i}
                  value={valor}
                  onChange={(e) =>
                    setParametros((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                  }
                  placeholder={plantilla.ejemplos[i] ?? `Valor para {{${i + 1}}}`}
                  aria-label={`Valor para el hueco ${i + 1}`}
                />
              ))}
            </div>
          ) : null}

          {llevaImagen ? (
            <HeaderImageField
              imagenDefectoUrl={imagenDefectoUrl}
              valor={imagen}
              onChange={setImagen}
            />
          ) : null}

          {plantilla ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Así lo verá</p>
              <MessagePreview
                cuerpo={plantilla.cuerpo}
                parametros={parametros.some((p) => p.trim()) ? parametros : plantilla.ejemplos}
                imagenUrl={urlImagen ?? imagenDefectoUrl}
                conImagen={llevaImagen}
                pie={plantilla.pie}
              />
            </div>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive-subtle px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!puedeEnviar}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
            className="min-w-36 transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              'Enviar plantilla'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
