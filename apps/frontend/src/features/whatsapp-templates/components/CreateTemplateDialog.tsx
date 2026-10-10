import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
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
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ImageDropzone } from '@/features/campaigns/components/ImageDropzone';
import { MessagePreview } from '@/features/campaigns/components/MessagePreview';
import {
  createWhatsAppTemplate,
  templateErrorMessage,
  uploadTemplateImage,
} from '../../../api/whatsapp-templates.js';
import { HeaderTypeSelector, type TipoEncabezado } from './HeaderTypeSelector.js';
import {
  CATEGORIAS_CON_IMAGEN,
  CATEGORIAS_PLANTILLA,
  type CategoriaPlantilla,
} from '../types/index.js';

const MAX_CUERPO = 1_024;
const MAX_PIE = 60;

const CATEGORIA_LABEL: Record<CategoriaPlantilla, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidad',
  AUTHENTICATION: 'Autenticación',
};

/** Placeholders `{{n}}` distintos, en orden. `null` si no son consecutivos desde 1 (Meta lo exige). */
function parsePlaceholders(cuerpo: string): number[] | null {
  const encontrados = [...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const unicos = [...new Set(encontrados)].sort((a, b) => a - b);
  const consecutivos = unicos.every((n, i) => n === i + 1);
  return consecutivos ? unicos : null;
}

/** Estado de la imagen de muestra: se sube en cuanto se elige, para no esperar al final. */
type Subida =
  | { fase: 'vacia' }
  | { fase: 'subiendo'; progreso: number }
  | { fase: 'lista'; uploadId: string }
  | { fase: 'error'; mensaje: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Alta de una plantilla, de solo texto o con imagen de encabezado (HT-WA-04).
 *
 * El formulario y el mensaje resultante van lado a lado: con imagen, la única forma de saber si
 * «queda bien» es verlo junto. La imagen se sube a Meta en cuanto se elige —con su barra de
 * progreso— y así enviar la plantilla al final es inmediato y no un segundo tiempo de espera.
 */
export function CreateTemplateDialog({ open, onOpenChange }: Props): React.ReactElement {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [language, setLanguage] = useState('es');
  const [category, setCategory] = useState<CategoriaPlantilla>('UTILITY');
  const [encabezado, setEncabezado] = useState<TipoEncabezado>('NINGUNA');
  const [imagen, setImagen] = useState<File | null>(null);
  const [urlImagen, setUrlImagen] = useState<string | null>(null);
  const [subida, setSubida] = useState<Subida>({ fase: 'vacia' });
  const [cuerpo, setCuerpo] = useState('');
  const [pie, setPie] = useState('');
  const [ejemplos, setEjemplos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Cada subida lleva un número: si se elige otra imagen antes de que termine la anterior, la
  // respuesta vieja llega tarde y no debe pisar a la nueva.
  const intentoRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setName('');
    setLanguage('es');
    setCategory('UTILITY');
    setEncabezado('NINGUNA');
    setImagen(null);
    setSubida({ fase: 'vacia' });
    setCuerpo('');
    setPie('');
    setEjemplos([]);
    setError(null);
    intentoRef.current += 1;
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

  const imagenDisponible = CATEGORIAS_CON_IMAGEN.includes(category);
  const conImagen = encabezado === 'IMAGE';

  const placeholders = useMemo(() => parsePlaceholders(cuerpo), [cuerpo]);
  const parametrosInvalidos = cuerpo.trim().length > 0 && placeholders === null;

  useEffect(() => {
    const n = placeholders?.length ?? 0;
    setEjemplos((prev) => {
      if (prev.length === n) return prev;
      const next = prev.slice(0, n);
      while (next.length < n) next.push('');
      return next;
    });
  }, [placeholders]);

  function subir(archivo: File): void {
    const intento = ++intentoRef.current;
    setSubida({ fase: 'subiendo', progreso: 0 });
    uploadTemplateImage(archivo, (progreso) => {
      if (intentoRef.current === intento) setSubida({ fase: 'subiendo', progreso });
    })
      .then(({ uploadId }) => {
        if (intentoRef.current === intento) setSubida({ fase: 'lista', uploadId });
      })
      .catch((err: unknown) => {
        if (intentoRef.current !== intento) return;
        setSubida({
          fase: 'error',
          mensaje: templateErrorMessage(err, 'No se pudo subir la imagen. Intenta de nuevo.'),
        });
      });
  }

  function elegirImagen(archivo: File | null): void {
    setImagen(archivo);
    if (archivo) {
      subir(archivo);
    } else {
      intentoRef.current += 1;
      setSubida({ fase: 'vacia' });
    }
  }

  function elegirCategoria(valor: CategoriaPlantilla): void {
    setCategory(valor);
    // Autenticación no admite imagen: se vuelve a solo texto en vez de dejar una opción imposible.
    if (!CATEGORIAS_CON_IMAGEN.includes(valor)) setEncabezado('NINGUNA');
  }

  const mutation = useMutation({
    mutationFn: () =>
      createWhatsAppTemplate({
        name: name.trim(),
        language: language.trim(),
        category,
        cuerpo: cuerpo.trim(),
        ejemplos,
        ...(conImagen && subida.fase === 'lista'
          ? { cabecera: { formato: 'IMAGE' as const, uploadId: subida.uploadId } }
          : {}),
        ...(pie.trim() ? { pie: pie.trim() } : {}),
      }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast.success('Plantilla enviada a Meta', {
        description: `${saved.name} queda esperando la aprobación.`,
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      setError(templateErrorMessage(err, 'No se pudo crear la plantilla. Intenta de nuevo.'));
    },
  });

  const nombreValido = /^[a-z0-9_]+$/.test(name.trim());
  const imagenLista = !conImagen || subida.fase === 'lista';
  const puedeGuardar =
    nombreValido &&
    language.trim().length >= 2 &&
    cuerpo.trim().length > 0 &&
    !parametrosInvalidos &&
    ejemplos.every((e) => e.trim().length > 0) &&
    imagenLista &&
    !mutation.isPending;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!puedeGuardar) return;
    setError(null);
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nueva plantilla</DialogTitle>
          <DialogDescription>
            Se envía a Meta para aprobación. El contenido queda fijo mientras se revisa: cualquier
            cambio después exige volver a aprobarla.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tpl-name">Nombre</Label>
                  <Input
                    id="tpl-name"
                    className="mt-1.5"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="recordatorio_cita"
                    required
                    autoFocus
                  />
                  {name.length > 0 && !nombreValido && (
                    <p className="mt-1 text-xs text-destructive">
                      Solo minúsculas, números y guión bajo.
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="tpl-language">Idioma</Label>
                  <Input
                    id="tpl-language"
                    className="mt-1.5"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    placeholder="es"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="tpl-category">Categoría</Label>
                <Select value={category} onValueChange={(v) => elegirCategoria(v as CategoriaPlantilla)}>
                  <SelectTrigger id="tpl-category" className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_PLANTILLA.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORIA_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <HeaderTypeSelector
                valor={encabezado}
                onChange={setEncabezado}
                imagenDisponible={imagenDisponible}
              />

              {conImagen && (
                <div className="space-y-2">
                  <Label>Imagen de encabezado</Label>
                  <ImageDropzone valor={imagen} onChange={elegirImagen} />
                  {subida.fase === 'subiendo' && (
                    <div className="space-y-1" aria-live="polite">
                      <Progress value={subida.progreso} aria-label="Subiendo la imagen" />
                      <p className="text-xs tabular-nums text-muted-foreground">
                        Subiendo la imagen… {subida.progreso}%
                      </p>
                    </div>
                  )}
                  {subida.fase === 'error' && imagen && (
                    <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert">
                      <span>{subida.mensaje}</span>
                      <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => subir(imagen)}>
                        Reintentar
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Será la imagen por defecto. En cada campaña o envío podrás cambiarla sin volver
                    a pedir aprobación.
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="tpl-cuerpo">Cuerpo</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {cuerpo.length.toLocaleString('es-CO')} / {MAX_CUERPO.toLocaleString('es-CO')}
                  </span>
                </div>
                <Textarea
                  id="tpl-cuerpo"
                  className="mt-1.5 resize-y"
                  rows={4}
                  value={cuerpo}
                  onChange={(e) => setCuerpo(e.target.value)}
                  placeholder="Hola {{1}}, tu cita es el {{2}}."
                  maxLength={MAX_CUERPO}
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Usa <code className="rounded bg-muted px-1 py-0.5">{'{{1}}'}</code>,{' '}
                  <code className="rounded bg-muted px-1 py-0.5">{'{{2}}'}</code>… para los datos
                  variables, en orden y sin saltos.
                </p>
                {parametrosInvalidos && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-destructive">
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                    Los parámetros deben ser consecutivos empezando en {'{{1}}'}.
                  </p>
                )}
              </div>

              {ejemplos.length > 0 && (
                <div className="space-y-2">
                  <Label>Ejemplos (para la vista previa y la revisión de Meta)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {ejemplos.map((valor, i) => (
                      <Input
                        key={i}
                        value={valor}
                        onChange={(e) =>
                          setEjemplos((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                        }
                        placeholder={`Ejemplo para {{${i + 1}}}`}
                        aria-label={`Ejemplo para el hueco ${i + 1}`}
                        required
                      />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="tpl-pie">
                    Pie <span className="font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {pie.length} / {MAX_PIE}
                  </span>
                </div>
                <Input
                  id="tpl-pie"
                  className="mt-1.5"
                  value={pie}
                  onChange={(e) => setPie(e.target.value)}
                  placeholder="Responde SALIR para no recibir más mensajes"
                  maxLength={MAX_PIE}
                />
              </div>
            </div>

            <div className="space-y-1.5 md:sticky md:top-0 md:self-start">
              <p className="text-sm font-medium text-foreground">Así lo verán</p>
              <MessagePreview
                cuerpo={cuerpo.trim() || null}
                parametros={ejemplos}
                imagenUrl={urlImagen}
                conImagen={conImagen}
                pie={pie.trim() || null}
                textoVacio="Escribe el cuerpo para ver el mensaje"
              />
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive-subtle px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!puedeGuardar}
              className="min-w-40 transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                'Enviar a Meta'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
